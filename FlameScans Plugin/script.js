showView();

const cloudflare = {
	isProtected: () => {
		return document.title === 'Just a moment...'
	},
	bypass: () => {
		isJSAllowed().then((jsAllowed) => {
			if (jsAllowed) {
				disallowJS();
				showView();
			} else {
				allowJS();
			}
			location.reload();
		});
	}
}

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

	const image = { ext: url.pathname.split('.').pop(), b64: '' };

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
}

const loadImages = (urls) => {
	// Check if the parameter is valid
	if (!Array.isArray(urls)) {
		throw new Error('urls is not an Array');
	}

	return new Promise((resolve, reject) => {
		const images = [];
		let loaded = 0;

		const done = () => {
			loaded++;
			if (loaded < urls.length) {
				return;
			}
			resolve(images);
		};

		urls.forEach((url) => {
			loadImage(url).then((image) => {
				images.push(image);
				done();
			}).catch((error) => {
				reject(error);
			});
		});
	});
};

const loadAndSave = (chapter, series, imgUrls) => {
	const info = {
		chapterName: chapter.chapterName,
		nextUrl: chapter.nextUrl,
		images: undefined,
		series: {
			title: series.title,
		}
	};

	if (typeof series.description === 'string') {
		info.series.description = series.description;
	}
	if (typeof series.status === 'string') {
		info.series.status = series.status;
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
			save(info);
		}).catch((error) => {
			fail('Loading the images failed with an error: ' + error);
		});
	} catch (error) {
		fail('Loading/saving the images failed with an error: ' + error);
	}
}

// Check if the URL points to a chapter
if (!location.pathname.match(/chapter/i)) {
	alert('FAILED' + '\n\n' + 'Not the URL to a chapter.');
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
		chapterName: 'Chapter' + document.querySelector('.entry-title').innerText.split('Chapter').reverse()[0],
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

	allowRemoteContent();
	isRemoteContentAllowed().then((contentAllowed) => {
		if (!contentAllowed) {
			location.reload();
			return;
		}

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
					info.series.description = doc.querySelector('.summary div[itemprop="description"] > p')?.innerText;
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
