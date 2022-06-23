showView();

// Cloudflare detection
if (document.title === 'Just a moment...') {
	// Cloudflare bypass
	isJSAllowed().then((jsAllowed) => {
		if (jsAllowed) {
			disallowJS();
			document.onload = disallowContent;
		} else {
			allowJS();
			allowContent();
			location.reload();
		}
	});
} else {
	// Chapter download
	const info = {
		series: {
			title: document.querySelector('.headpost > .allc > a').innerText
		},
		chapterName: 'Chapter' + document.querySelector('.entry-title').innerText.split('Chapter').reverse()[0],
	};

	const scripts = Array.from(document.scripts);
	scripts.forEach((elem) => {
		if (!elem.innerText.startsWith('ts_reader.run(')) {
			return;
		}

		const data = JSON.parse(elem.innerText.replace(/^ts_reader\.run\(/, '').replace(/\);?$/, ''));

		info.nextUrl = data.nextUrl;
		info.urls = data.sources['0'].images;
	});

	downloadChapter(info);
}
