/**
 * 批量下載カクヨム小説的工具。 Download kakuyomu novels.
 */

'use strict';

require('../work_crawler_loader.js');

// ----------------------------------------------------------------------------

CeL.run([ 'application.storage.EPUB'
// .to_file_name()
, 'application.net',
// CeL.detect_HTML_language()
, 'application.locale' ]);

function get_apollo_state(html) {
	var matched = html.match(
	// Kakuyomu's current work page is rendered by Next.js.
	/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
	if (!matched) {
		return;
	}
	try {
		return JSON.parse(matched[1]).props.pageProps.__APOLLO_STATE__;
	} catch (error) {
		CeL.error('Failed to parse Kakuyomu __NEXT_DATA__: ' + error.message);
	}
}

function resolve_reference(state, reference) {
	return reference && reference.__ref && state[reference.__ref];
}

function get_work_from_state(state) {
	if (!state || !state.ROOT_QUERY) {
		return;
	}
	var work_reference;
	Object.keys(state.ROOT_QUERY).some(function(key) {
		if (key.startsWith('work(')) {
			work_reference = state.ROOT_QUERY[key];
			return true;
		}
	});
	return resolve_reference(state, work_reference);
}

var crawler = new CeL.work_crawler({
	// auto_create_ebook, automatic create ebook
	// MUST includes CeL.application.locale!
	need_create_ebook : true,
	// recheck:從頭檢測所有作品之所有章節。
	// 'changed': 若是已變更，例如有新的章節，則重新下載/檢查所有章節內容。
	recheck : 'changed',

	base_URL : 'https://kakuyomu.jp/',

	// 解析 作品名稱 → 作品id get_work()
	search_URL : 'search?order=popular&q=',
	parse_search_result : function(html, get_label) {
		var id_data = [],
		// {Array}id_list = [id,id,...]
		id_list = [], matched, PATTERN =
		//
		/<a href="\/works\/(\d+)" [^<>]*itemprop="name">(.+?)<\/a>/g;
		while (matched = PATTERN.exec(html)) {
			id_list.push(matched[1]);
			id_data.push(get_label(matched[2]));
		}
		return [ id_list, id_data ];
	},

	// 取得作品的章節資料。 get_work_data()
	work_URL : function(work_id) {
		return 'works/' + work_id;
	},
	parse_work_data : function(html, get_label) {
		var state = get_apollo_state(html), work = get_work_from_state(state);
		if (work) {
			var author = resolve_reference(state, work.author);
			return {
				title : work.title,
				status : [ work.serialStatus === 'COMPLETED' ? '完結済'
						: work.serialStatus ],
				author : author && (author.activityName || author.name),
				last_update : work.lastEpisodePublishedAt || work.editedAt,
				catchphrase : work.catchphrase,
				description : work.introduction,
				image : work.ogImageUrl,
				genre : work.genre,
				tags : work.tagLabels,
				site_name : 'カクヨム'
			};
		}

		var work_data = {
			// 必要屬性：須配合網站平台更改。
			title : get_label(html.between('<h1 id="workTitle">', '</h1>')),

			// 選擇性屬性：須配合網站平台更改。
			// e.g., 连载中, 連載中
			status : [],
			author : get_label(html.between(
					'<span id="workAuthor-activityName">', '</span>')),
			last_update : get_label(html.between(
					'<p class="widget-toc-date"><time datetime="', '"')),
			catchphrase : get_label(
			//
			html.between('<p id="catchphrase"', '</p>').between('>')
			// [[Quotation mark]]
			// The Unicode standard introduced a separate character
			// U+2015 ― HORIZONTAL BAR to be used as a quotation dash.
			.replace('<span id="catchphrase-authorDash"></span>', '―')).trim()
					.replace(/\s+/g, ' '),
			description : html.between('work-introduction">', '</p>').trim()

		}, PATTERN = /<meta property="og:([^"]+)" content="([^"]+)"/g, matched;

		while (matched = PATTERN.exec(html)) {
			// 避免覆寫。
			if (!work_data[matched[1]]) {
				work_data[matched[1]] = get_label(matched[2]);
			}
		}

		PATTERN = /<dt>(.+?)<\/dt>[^<>]*<dd>(.+?)<\/dd>/g;
		var text = html.between('<dl class="widget-credit">', '</dl>');
		while (matched = PATTERN.exec(text)) {
			work_data[get_label(matched[1])] = get_label(matched[2]);
		}

		html.between('<p class="widget-toc-workStatus">', '</p>')
		//
		.each_between('<span>', '</span>', function(text) {
			work_data.status.push(get_label(text));
		});
		if (work_data.種類) {
			work_data.status.push(work_data.種類);
		}
		work_data.site_name = work_data.site_name.between(null, ' ');

		if (work_data.image
		// 處理特殊圖片: ignore site default image
		&& work_data.image.includes('common\/ogimage.png')) {
			delete work_data.image;
		}

		return work_data;
	},
	get_chapter_list : function(work_data, html) {
		var state = get_apollo_state(html), work = get_work_from_state(state);
		if (work && work.tableOfContentsV2) {
			work_data.chapter_list = [];
			work.tableOfContentsV2.forEach(function(toc_reference) {
				var toc = resolve_reference(state, toc_reference);
				if (!toc || !toc.episodeUnions) {
					return;
				}
				toc.episodeUnions.forEach(function(episode_reference) {
					var episode = resolve_reference(state, episode_reference);
					if (!episode || !episode.id) {
						return;
					}
					work_data.chapter_list.push({
						url : '/works/' + work.id + '/episodes/' + episode.id,
						date : new Date(episode.publishedAt),
						title : episode.title
					});
				});
			});
			return;
		}

		work_data.chapter_list = [];
		html.between('<div class="widget-toc-main">', '</div>')
		//
		.each_between('<li', '</li>', function(text) {
			if (text.includes(' widget-toc-level')) {
				// is main title
				return;
			}
			work_data.chapter_list.push({
				url : text.between('<a href="', '"'),
				// text.between('datePublished" datetime="', '"')
				date : new Date(text.between(' datetime="', '"')),
				title : text.between(
				// <span class="widget-toc-episode-titleLabel
				// js-vertical-composition-item">第1話 どうやら死んだらしい</span>
				'<span class="widget-toc-episode-titleLabel', '</span>')
				//
				.between('>')
			});
		});
	},

	parse_chapter_data : function(html, work_data, get_label, chapter) {
		var part_title = [], sub_title,
		// <div class="widget-episodeBody js-episode-body" ...>
		header = html.between('<header id="contentMain-header">', '</header>'),
		PATTERN_title = /<p ([^<>]+)>([\s\S]+?)<\/p>/g,
		/**
		 * 2018/5/15 kakuyomu 調整了標題的HTML原始碼格式
		 * 
		 * <code>

		<header id="contentMain-header">
		<p id="contentMain-header-workTitle" class="js-vertical-composition-item">__workTitle__</p>
		<p id="contentMain-header-author">__author__</p>

		<p class="chapterTitle level1 js-vertical-composition-item"><span>__level1Title__</span></p>
		<p class="chapterTitle level2 js-vertical-composition-item"><span>__level2Title__</span></p>
		<p class="widget-episodeTitle js-vertical-composition-item">__episodeTitle__</p>
		</header>

		</code>
		 */
		matched;

		while (matched = PATTERN_title.exec(header)) {
			if (matched[1].includes('Title')) {
				var title = get_label(matched[2]);
				if (matched[1].includes('episodeTitle')) {
					sub_title = title;
				} else {
					part_title.push(title);
				}
			}
		}

		this.add_ebook_chapter(work_data, chapter, {
			title : part_title,
			sub_title : sub_title,
			text : html.between('episodeBody', '</div>').between('>')
		});
	}
});

// ----------------------------------------------------------------------------

// CeJS 4.5.10's built-in HTTPS proxy agent does not send SNI. Use a modern
// proxy agent while keeping the command-line `proxy=` option compatible.
var proxy_argument_index = process.argv.findIndex(function(argument) {
	return argument.startsWith('proxy=');
}), proxy_server = proxy_argument_index >= 0
		? process.argv[proxy_argument_index].slice('proxy='.length)
		: process.env.HTTPS_PROXY || process.env.https_proxy
				|| process.env.HTTP_PROXY || process.env.http_proxy;

if (proxy_server) {
	var HttpsProxyAgent = require('https-proxy-agent'),
	proxy_agent = new HttpsProxyAgent(proxy_server);
	// CeJS compares this value with the destination protocol and otherwise
	// replaces the custom agent with a direct HTTPS agent.
	proxy_agent.protocol = undefined;
	crawler.get_URL_options.agent = proxy_agent;
	delete process.env.HTTPS_PROXY;
	delete process.env.http_proxy;
	if (proxy_argument_index >= 0) {
		process.argv.splice(proxy_argument_index, 1);
		// work_crawler_loader.js has already parsed process.argv at this point.
		delete CeL.env.arg_hash.proxy;
	}
	CeL.info('Kakuyomu: using proxy ' + proxy_server);
}

// CeL.set_debug(3);

start_crawler(crawler, typeof module === 'object' && module);
