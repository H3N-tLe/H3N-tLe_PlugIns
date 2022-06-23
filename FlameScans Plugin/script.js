showView();

postWebKitMessage(['print','Test Test']);

const loadImages = (urls) => {
	// Check if the parameter is valid
	if (!Array.isArray(urls)) {
		throw new Error('urls is not an Array');
	}

	return new Promise((resolve, reject) => {
		const images = [];
		let loaded = 0;

		const done = () => {
			if (loaded < urls.length) {
				return;
			}
			resolve(images);
		};

		for (let i = 0; i < urls.length; i++) {
			images.push({ ext: urls[i].split('.').pop(), b64: '' });

			fetch(urls[i]).then((response) => {
				// Check if the response is valid
				if (!response.ok) {
					return;
				} else if (response.headers.get("content-type").startsWith('text/html')) {
					disallowContent();
					location.reload();
				}

				return response.blob();
			}).then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					images[i].b64 = reader.result.split(';base64,').pop();
					loaded++;
					done();
				};
				reader.readAsDataURL(blob);
			});

		}
	});
};

isJSAllowed().then((jsAllowed) => {

	if (!jsAllowed) {
		allowJS();
		allowContent();
		location.reload();
		return;
	}

	// Cloudflare detection
	if (document.title === 'Just a moment...') {
		/*/ Cloudflare bypass
		isContentAllowed().then((contentAllowed) => {
			if (contentAllowed) {
				disallowContent();
			} else {
				allowContent();
				location.reload();
			}
		});/**/
		return;
	}

	// Chapter download
	const info = {
		series: {
			title: document.querySelector('.headpost > .allc > a').innerText
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

	allowContent();
	isContentAllowed().then((contentAllowed) => {
		if (!contentAllowed) {
			location.reload();
		}

		try {
			loadImages(info.urls).then((images) => {
				info.images = images;
				download(info);
			});
		} catch (error) {
			fail();
		}
	});
});
