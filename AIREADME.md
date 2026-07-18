# Project Goal

- 使用 work-crawler 抓取受支持的网站内容，并提供可复现的运行与排错说明。
- 当前任务：抓取 Kakuyomu 作品 `16818093080247863087` 的全文并说明项目用法。

# Lessons Learned

- Kakuyomu 作品页已改为 Next.js；作品元数据和完整目录位于 `__NEXT_DATA__` 的 `__APOLLO_STATE__` 中，正文页仍可用 `widget-episodeBody` 解析。
- CeJS 4.5.10 自带的 HTTPS 代理 agent 在 CONNECT 后不发送 SNI，访问 CloudFront 会出现 `SSL/TLS alert handshake failure`。`novel.ja-JP/kakuyomu.js` 现在使用 `https-proxy-agent`，同时兼容 `HTTPS_PROXY` 环境变量和 `proxy=` 参数。
- Kakuyomu 命令行参数应使用作品 URL 中 `/works/` 后面的纯数字 ID，而不是整条 URL。
- 重复执行同一命令可以断点续传；若正文已完成但 EPUB 打包被中断，可加 `regenerate=true` 从缓存重建。
- 下载前在项目根目录执行 `npm install --omit=dev --ignore-scripts`；当前机器已有 Node.js 与 7-Zip。
- 成功验收：作品共 136 章，EPUB 含 137 个 XHTML（封面/书籍页加 136 章），`7z t` 检查结果为 `Everything is Ok`。

# Task Board

- [x] 确认 Kakuyomu 爬虫的调用方式与依赖。
- [x] 更新 Kakuyomu 作品页解析和代理兼容性。
- [x] 抓取作品 `16818093080247863087` 并核对章节完整性。
- [x] 整理安装、抓取、续传、重建和输出说明。
