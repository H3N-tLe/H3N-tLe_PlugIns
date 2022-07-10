try {

	showView();

	const cloudflare = {
		isProtected: () => {
			return document.title === 'Just a moment...';
		},
		bypass: () => {
			isJSAllowed().then((jsAllowed) => {
				if (jsAllowed) {
					disallowJS();
					showView();
					return;
				} else {
					allowJS();
				}
				location.reload();
			});
		}
	};

	const showMessage = (message) => {
		document.head.innerHTML = `
		<style>
			body {
				display: flex;
				justify-content: center;
				align-items: center;
				background-color: rgb(0, 0, 0);
				color: rgb(255, 255, 255);
			}
		</style>`;
		document.body.innerHTML = `<h1 style="text-align: center;">${message.replaceAll('\n', '<br>')}</h1>`;
	};

	const loadImage = (url) => {
		// Check if the parameter is valid
		if (typeof url !== 'string' && !(url instanceof URL)) {
			throw new Error('url is not a string or URL');
		} else if (typeof url === 'string') {
			try {
				url = new URL(url);
			} catch (error) {
				throw new Error('url is not a valid URL');
			}
		}

		const image = { ext: '.' + url.pathname.split('.').pop(), b64: '' };

		return new Promise((resolve, reject) => {
			fetch(url).then((response) => {
				// Check if the response is valid
				if (response.headers.get('content-type').startsWith('text/html')) {
					disallowRemoteContent();
					cloudflare.bypass();
					reject(new Error('Got HTML response'));
				}

				return response.blob();
			}).then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					image.b64 = reader.result.split(';base64,').pop();
					resolve(image);
				};
				reader.readAsDataURL(blob);
			});
		});
	};

	const loadImages = (urls) => {
		// Check if the parameter is valid
		if (!Array.isArray(urls)) {
			throw new Error('urls is not an Array');
		}

		return new Promise((resolve, reject) => {
			const images = new Array(urls.length);
			let loaded = 0;

			const done = () => {
				loaded++;
				showMessage(`Loading images...\n${loaded}/${urls.length}`);
				if (loaded < urls.length) {
					return;
				}
				resolve(images);
			};

			urls.forEach((url, i) => {
				loadImage(url).then((image) => {
					images[i] = image;
					done();
				}).catch((error) => {
					reject(error);
				});
			});
		});
	};

	const loadAndSave = (chapter, series, imgUrls) => {
		const info = {
			chapterName: chapter.chapterName.trim(),
			nextUrl: chapter.nextUrl,
			images: undefined,
			series: {
				title: series.title.trim(),
			}
		};

		if (typeof series.description === 'string') {
			info.series.description = series.description.trim();
		}
		if (typeof series.status === 'string') {
			info.series.status = series.status.trim();
		}
		if (typeof series.cover === 'object' &&
			typeof series.cover.ext === 'string' &&
			typeof series.cover.b64 === 'string'
		) {
			info.series.cover = series.cover;
		}

		try {
			loadImages(imgUrls).then((images) => {
				info.images = images;
				hideView();
				save(info);
			}).catch((error) => {
				fail('Loading the images failed with an error: ' + error);
			});
		} catch (error) {
			fail('Loading/saving the images failed with an error: ' + error);
		}
	};

	// Check if the URL points to a chapter
	if (!location.pathname.match(/chapter/i)) {
		showMessage('FAILED' + '\n\n' + 'Not the URL to a chapter.');
		fail('Not the URL to a chapter.');
	}

	isJSAllowed().then((jsAllowed) => {
		// Cloudflare detection
		if (cloudflare.isProtected()) {
			cloudflare.bypass();
			return;
		}

		if (!jsAllowed) {
			allowJS();
			location.reload();
			return;
		}

		const seriesLink = document.querySelector('.headpost > .allc > a');

		// Chapter download
		const info = {
			series: {
				title: seriesLink.innerText
			},
			chapterName: 'Chapter ' + document.querySelector('.entry-title').innerText.split(/chapter/i).pop().trim().match(/^\d+(?:\.\d+)?/)[0],
		};

		const scripts = Array.from(document.scripts);
		scripts.forEach((elem) => {
			if (!elem.innerHTML.startsWith('ts_reader.run(')) {
				return;
			}

			const data = JSON.parse(elem.innerHTML.replace(/^ts_reader\.run\(/, '').replace(/\);?$/, ''));

			info.nextUrl = data.nextUrl;
			info.urls = data.sources['0'].images;
		});

		// Remove everything that could cause a request to be sent
		[
			...document.head.children,
			...document.body.children,
		].forEach((elem) => elem.remove());

		allowRemoteContent();
		isRemoteContentAllowed().then((contentAllowed) => {
			if (!contentAllowed) {
				location.reload();
				return;
			}

			showMessage('Now Downloading...');

			doesSeriesExist(info.series.title).then((exists) => {
				// If the series already exists, don't load additional information
				if (exists) {
					loadAndSave(info, info.series, info.urls);
					return;
				}

				let contentType = '';
				try {
					// Download the HTML of the series page
					fetch(seriesLink.href).then((response) => {
						// Determine the content type
						contentType = response.headers.get('content-type').split(';')[0];
						return response.text();
					}).then((html) => {
						// Parse the HTML
						const parser = new DOMParser();
						const doc = parser.parseFromString(html, contentType);

						// Get the series description and status
						info.series.description = Array.from(doc.querySelectorAll('.summary div[itemprop="description"] > p')).map(a => a?.innerText).join(' ');
						info.series.status = doc.querySelector('.status')?.innerText.toLowerCase();

						// Try to get the cover image
						loadImage(doc.querySelector('.thumb > img')?.src).then((image) => {
							// If successful, save with the cover image
							info.series.cover = image;
							loadAndSave(info, info.series, info.urls);
						}).catch((error) => {
							// If that failed save the series without a cover image
							loadAndSave(info, info.series, info.urls);
						});
					});
				} catch (error) {
					fail('Loading the series page failed with an error: ' + error);
				}
			});
		});
	});

} catch (error) {
	fail('An error occurred: ' + error);
}
