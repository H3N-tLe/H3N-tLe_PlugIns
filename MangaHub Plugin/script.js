const dbp = (message) => postWebKitMessage(['print', message]);

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
					return;
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
	if (!location.pathname.match(/^\/chapter\/[^\/]+\/chapter-\d+(?:\.\d+)?\//i)) {
		showMessage('FAILED' + '\n\n' + 'Not the URL to a chapter.');
		fail('Not the URL to a chapter.');
	}

	isJSAllowed().then((jsAllowed) => {
		// Cloudflare detection
		if (cloudflare.isProtected()) {
			cloudflare.bypass();
			return;
		}

		const title = document.querySelector('._1Gflr > a')?.innerText;

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

			const apiUrl = 'https://api.mghubcdn.com/graphql';
			const coverBaseUrl = 'https://thumb.mghubcdn.com/';
			const imageBaseUrl = 'https://img.mghubcdn.com/file/imghub/';

			const slug = location.pathname.match(/([^\/]+)\/[^\/]+\/?$/)[1];
			const number = location.pathname.match(/chapter-(\d+(?:\.\d+)?)\/?$/)[1];

			const requestInit = {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'accept': 'application/json',
				},
				body: JSON.stringify({
					query: `{chapter(slug: "${slug}", number: ${number}){pages}, manga(slug: "${slug}"){title, description, status, image} }`,
				}),
			};

			dbp('Request init: ' + JSON.stringify(requestInit, null, 4));

			showMessage('Now Downloading...');

			fetch(apiUrl, requestInit).then((response) => {
				dbp('Got info');
				return response.json();
			}).then((result) => {
				if (result.errors) {
					fail(result.errors.map((error) => error.message).join('\n'));
					return;
				}

				const manga = result.data.manga;
				const chapter = result.data.chapter;

				const info = {
					series: {
						title: manga.title,
					},
					chapterName: 'Chapter ' + number,
				};

				dbp('Created info object');

				if (typeof manga.description === 'string') {
					info.series.description = manga.description.trim();
				}
				if (typeof manga.status === 'string') {
					info.series.status = manga.status.trim().toLowerCase();
				}

				try {
					const nextUrl = new URL(document.querySelector('.next > a').href);

					if (nextUrl.pathname.startsWith('/chapter/')) {
						info.nextUrl = nextUrl.href;
						dbp('Next URL: ' + info.nextUrl);
					}
				} catch (error) {
					dbp('Failed to get next URL');
				}

				const imageUrls = [];
				const pageCount = Object.keys(chapter.pages).length;
				for (let i = 1; i <= pageCount; i++) {
					imageUrls.push(imageBaseUrl + chapter.pages[i]);
				}

				dbp('Image URLs:\n  ' + imageUrls.join('\n  '));

				doesSeriesExist(manga.title).then((exists) => {
					// Check if we have the url to the cover
					if (exists) {
						loadImage(coverBaseUrl + manga.image).then((image) => {
							info.series.cover = image;
							loadAndSave(chapter, info.series, imageUrls);
						}).catch((error) => {
							fail('Loading the cover image failed with an error: ' + error);
						});
					} else {
						loadAndSave(chapter, info.series, imageUrls);
					}
				});
			}).catch((error) => {
				fail('Fetching the chapter failed with an error: ' + error);
			});
		});
	});

} catch (error) {
	fail('An error occurred: ' + error);
}
