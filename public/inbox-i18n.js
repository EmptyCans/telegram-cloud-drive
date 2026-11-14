const languages = ["zh", "en", "ko", "ja"];
const messages = new Map([
  ["云盘",["Drive","클라우드 드라이브","クラウドドライブ"]],
  ["公开文件夹",["Shared folder","공유 폴더","共有フォルダー"]],
  ["文件结构",["Folder structure","폴더 구조","フォルダー構成"]],
  ["目录树",["Folder tree","폴더 트리","フォルダーツリー"]],
  ["正在打开文件夹…",["Opening folder…","폴더 여는 중…","フォルダーを開いています…"]],
  ["拖放文件或文件夹，也可粘贴文件上传",["Drop files or folders, or paste files to upload","파일이나 폴더를 끌어 놓거나 파일을 붙여넣으세요","ファイルやフォルダーをドロップするか、ファイルを貼り付けてアップロード"]],
  ["新建文件夹",["New folder","새 폴더","新規フォルダー"]],
  ["上传文件夹",["Upload folder","폴더 업로드","フォルダーをアップロード"]],
  ["上传文件",["Upload files","파일 업로드","ファイルをアップロード"]],
  ["搜索当前目录",["Search this folder","현재 폴더 검색","現在のフォルダーを検索"]],
  ["文件类型",["File type","파일 유형","ファイルの種類"]],
  ["全部类型",["All types","모든 유형","すべての種類"]],
  ["文件夹",["Folder","폴더","フォルダー"]],
  ["图片",["Images","이미지","画像"]],
  ["视频",["Videos","동영상","動画"]],
  ["音频",["Audio","오디오","音声"]],
  ["文档",["Documents","문서","ドキュメント"]],
  ["表格",["Spreadsheets","스프레드시트","スプレッドシート"]],
  ["演示文稿",["Presentations","프레젠테이션","プレゼンテーション"]],
  ["压缩包",["Archives","압축 파일","圧縮ファイル"]],
  ["代码和网页",["Code and web pages","코드 및 웹 페이지","コードとウェブページ"]],
  ["安装包",["Installers","설치 파일","インストーラー"]],
  ["搜索",["Search","검색","検索"]],
  ["目录路径",["Folder path","폴더 경로","フォルダーパス"]],
  ["排序",["Sort","정렬","並べ替え"]],
  ["创建时间 · 最新",["Created · Newest","생성일 · 최신순","作成日時 · 新しい順"]],
  ["创建时间 · 最早",["Created · Oldest","생성일 · 오래된 순","作成日時 · 古い順"]],
  ["名称 · 升序",["Name · Ascending","이름 · 오름차순","名前 · 昇順"]],
  ["名称 · 降序",["Name · Descending","이름 · 내림차순","名前 · 降順"]],
  ["大小 · 从大到小",["Size · Largest","크기 · 큰 순","サイズ · 大きい順"]],
  ["大小 · 从小到大",["Size · Smallest","크기 · 작은 순","サイズ · 小さい順"]],
  ["文件视图",["File view","파일 보기","ファイル表示"]],
  ["列表",["List","목록","リスト"]],
  ["网格",["Grid","격자","グリッド"]],
  ["名称",["Name","이름","名前"]],
  ["创建时间",["Created","생성일","作成日時"]],
  ["类型",["Type","유형","種類"]],
  ["大小",["Size","크기","サイズ"]],
  ["操作",["Actions","작업","操作"]],
  ["文件列表",["File list","파일 목록","ファイル一覧"]],
  ["文件",["Files","파일","ファイル"]],
  ["这个文件夹还没有文件。",["This folder is empty.","이 폴더는 비어 있습니다.","このフォルダーは空です。"]],
  ["上一页",["Previous page","이전 페이지","前のページ"]],
  ["下一页",["Next page","다음 페이지","次のページ"]],
  ["在 GitHub 查看项目",["View project on GitHub","GitHub에서 프로젝트 보기","GitHubでプロジェクトを見る"]],
  ["通知",["Notifications","알림","通知"]],
  ["文件上传进度",["Upload progress","업로드 진행 상황","アップロードの進行状況"]],
  ["暂无通知",["No notifications","알림 없음","通知はありません"]],
  ["由 Telegram Cloud Drive 提供",["Powered by Telegram Cloud Drive","Telegram Cloud Drive 제공","Telegram Cloud Drive 提供"]],
  ["下载原文件",["Download original","원본 다운로드","元のファイルをダウンロード"]],
  ["关闭",["Close","닫기","閉じる"]],
  ["上一项",["Previous item","이전 항목","前の項目"]],
  ["下一项",["Next item","다음 항목","次の項目"]],
  ["语言",["Language","언어","言語"]],
  ["下载",["Download","다운로드","ダウンロード"]],
  ["文件夹名称",["Folder name","폴더 이름","フォルダー名"]],
  ["正在准备下载…",["Preparing download…","다운로드 준비 중…","ダウンロードを準備しています…"]],
  ["已交给浏览器下载",["Download sent to browser","브라우저로 다운로드를 전달했습니다","ブラウザーにダウンロードを渡しました"]],
  ["{name}的子目录",["Subfolders of {name}","{name}의 하위 폴더","{name} のサブフォルダー"]],
  ["单个文件不超过 {limit} MiB",["Up to {limit} MiB per file","파일당 최대 {limit} MiB","1 ファイルあたり最大 {limit} MiB"]],
  ["没有找到匹配的文件或文件夹。",["No matching files or folders.","일치하는 파일이나 폴더가 없습니다.","一致するファイルやフォルダーがありません。"]],
  ["第 {page} 页",["Page {page}","{page} 페이지","{page} ページ"]],
  ["文件必须大于 0 字节且不超过 {limit} MiB",["Files must be larger than 0 bytes and at most {limit} MiB.","파일은 0바이트보다 크고 {limit} MiB 이하여야 합니다.","ファイルは 0 バイトより大きく、{limit} MiB 以下である必要があります。"]],
  ["已上传 {done}/{total} 个文件",["Uploaded {done}/{total} files","파일 {done}/{total}개 업로드 완료","{done}/{total} 件のファイルをアップロードしました"]],
  ["已创建 {count} 个文件夹",["Created {count} folders","폴더 {count}개 생성 완료","{count} 件のフォルダーを作成しました"]],
  ["已创建文件夹「{name}」",["Created folder “{name}”","폴더 ‘{name}’ 생성 완료","フォルダー「{name}」を作成しました"]],
  ["公开文件夹链接已失效，请索取新的短链接。",["This shared folder link has expired. Ask for a new link.","공유 폴더 링크가 만료되었습니다. 새 링크를 요청하세요.","共有フォルダーのリンクが失効しました。新しいリンクを入手してください。"]],
  ["文件超过上传限制。",["File exceeds the upload limit.","파일이 업로드 제한을 초과했습니다.","ファイルがアップロード上限を超えています。"]],
  ["请求失败，请稍后重试。",["Request failed. Try again shortly.","요청에 실패했습니다. 잠시 후 다시 시도하세요.","リクエストに失敗しました。しばらくしてから再試行してください。"]],
  ["正在加载预览…",["Loading preview…","미리보기 로딩 중…","プレビューを読み込んでいます…"]],
  ["浏览器无法预览此文件，请下载后打开。",["Your browser cannot preview this file. Download it to open it.","이 파일을 미리 볼 수 없습니다. 다운로드한 후 여세요.","このファイルはプレビューできません。ダウンロードして開いてください。"]],
  ["正在保存 · {name}",["Saving · {name}","저장 중 · {name}","保存中 · {name}"]],
  ["正在上传 {percent}% · {name}",["Uploading {percent}% · {name}","업로드 중 {percent}% · {name}","アップロード中 {percent}% · {name}"]],
  ["网络连接失败，请重试。",["Network error. Try again.","네트워크 오류입니다. 다시 시도하세요.","ネットワークエラーです。再試行してください。"]],
  ["上传已中断。",["Upload was interrupted.","업로드가 중단되었습니다.","アップロードが中断されました。"]],
  ["上传失败（{status}）",["Upload failed ({status}).","업로드 실패 ({status}).","アップロードに失敗しました（{status}）。"]],
]);

function preferredLanguage() {
  try {
    const saved = localStorage.getItem("inbox-language");
    if (languages.includes(saved)) return saved;
  } catch {}
  return (navigator.languages ?? [navigator.language])
    .map(locale => locale.toLowerCase().split("-")[0])
    .find(locale => languages.includes(locale)) ?? "en";
}

export const language = preferredLanguage();
export const translate = (source, values = {}) =>
  (messages.get(source)?.[languages.indexOf(language) - 1] ?? source)
    .replace(/\{(\w+)\}/g, (placeholder, key) => values[key] ?? placeholder);

export function localizeInbox() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const source = node.data.trim();
    if (messages.has(source)) node.data = node.data.replace(source, () => translate(source));
  }
  for (const element of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const source = element.getAttribute(attribute);
      if (messages.has(source)) element.setAttribute(attribute, translate(source));
    }
  }
  const picker = document.getElementById("inbox-language");
  picker.value = language;
  picker.addEventListener("change", () => {
    try {
      localStorage.setItem("inbox-language", picker.value);
    } catch {
      picker.value = language;
      return;
    }
    location.reload();
  });
}
