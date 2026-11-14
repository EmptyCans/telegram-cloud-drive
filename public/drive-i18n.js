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
  ["管理员登录",["Administrator sign-in","관리자 로그인","管理者ログイン"]],
  ["管理员密钥",["Administrator key","관리자 키","管理者キー"]],
  ["输入管理员密钥",["Enter administrator key","관리자 키 입력","管理者キーを入力"]],
  ["管理员密钥至少 8 个字符。",["The administrator key must be at least 8 characters.","관리자 키는 8자 이상이어야 합니다.","管理者キーは8文字以上必要です。"]],
  ["登录",["Sign in","로그인","ログイン"]],
  ["文件管理",["File management","파일 관리","ファイル管理"]],
  ["根目录",["Root","루트","ルート"]],
  ["根目录的子目录",["Root subfolders","루트 하위 폴더","ルートのサブフォルダー"]],
  ["网盘管理",["Drive management","드라이브 관리","ドライブ管理"]],
  ["链接管理",["Manage links","링크 관리","リンク管理"]],
  ["设置",["Settings","설정","設定"]],
  ["使用帮助",["Help","도움말","ヘルプ"]],
  ["退出登录",["Sign out","로그아웃","ログアウト"]],
  ["批量操作",["Bulk actions","일괄 작업","一括操作"]],
  ["新建目录",["New folder","새 폴더","新規フォルダー"]],
  ["搜索文件或目录",["Search files or folders","파일 또는 폴더 검색","ファイルまたはフォルダーを検索"]],
  ["搜索名称",["Search by name","이름 검색","名前で検索"]],
  ["筛选标签",["Filter by tag","태그로 필터링","タグで絞り込み"]],
  ["全选当前页",["Select this page","현재 페이지 전체 선택","このページをすべて選択"]],
  ["批量移动",["Move selected","선택 항목 이동","選択項目を移動"]],
  ["批量删除",["Delete selected","선택 항목 삭제","選択項目を削除"]],
  ["返回文件",["Back to files","파일로 돌아가기","ファイルに戻る"]],
  ["暂无公开链接。",["No public links yet.","공개 링크가 없습니다.","公開リンクはありません。"]],
  ["Telegram Cloud Drive · MIT 许可证",["Telegram Cloud Drive · MIT License","Telegram Cloud Drive · MIT 라이선스","Telegram Cloud Drive · MIT ライセンス"]],
  ["目标目录",["Destination folder","대상 폴더","移動先フォルダー"]],
  ["取消",["Cancel","취소","キャンセル"]],
  ["移动",["Move","이동","移動"]],
  ["上传文件和文件夹",["Upload files and folders","파일 및 폴더 업로드","ファイルとフォルダーのアップロード"]],
  ["可以选择、拖放文件或文件夹，也可以粘贴文件。上传文件夹会保留目录结构。",["Choose or drop files or folders, or paste files. Folder uploads preserve the folder structure.","파일이나 폴더를 선택하거나 끌어 놓고, 파일을 붙여넣을 수도 있습니다. 폴더 구조는 유지됩니다.","ファイルやフォルダーを選択またはドロップするか、ファイルを貼り付けます。フォルダー構成は維持されます。"]],
  ["管理和预览",["Manage and preview","관리 및 미리보기","管理とプレビュー"]],
  ["点击文件夹进入目录，点击支持的文件在线预览。用「批量操作」多选、移动或删除。",["Open folders or preview supported files by clicking them. Use Bulk actions to select, move, or delete multiple items.","폴더를 클릭해 열거나 지원되는 파일을 미리 봅니다. 일괄 작업으로 여러 항목을 선택, 이동 또는 삭제하세요.","クリックしてフォルダーを開くか、対応ファイルをプレビューできます。一括操作で複数項目を選択、移動、削除できます。"]],
  ["分享和收集文件",["Share and collect files","파일 공유 및 수집","ファイルの共有と収集"]],
  ["在文件或文件夹的更多菜单中创建分享短链。公开文件夹的访客可以浏览、下载、上传和新建目录。",["Create a short sharing link from the item's action menu. Visitors can browse, download, upload, and create folders in shared folders.","항목의 더보기 메뉴에서 짧은 공유 링크를 만듭니다. 방문자는 공유 폴더에서 탐색, 다운로드, 업로드 및 폴더 생성을 할 수 있습니다.","項目の操作メニューから短い共有リンクを作成します。共有フォルダーでは閲覧、ダウンロード、アップロード、フォルダー作成ができます。"]],
  ["链接管理和设置",["Link management and settings","링크 관리 및 설정","リンク管理と設定"]],
  ["用侧栏的链条图标查看、复制或撤销分享。用齿轮图标修改站点名称和单文件上传上限。",["Use the link icon in the sidebar to view, copy, or revoke links. Use the gear icon to change the site name and upload limit.","사이드바의 링크 아이콘으로 링크를 확인, 복사 또는 취소합니다. 톱니바퀴 아이콘으로 사이트 이름과 업로드 제한을 변경합니다.","サイドバーのリンクアイコンでリンクを表示、コピー、無効化できます。歯車アイコンでサイト名とアップロード上限を変更できます。"]],
  ["站点设置",["Site settings","사이트 설정","サイト設定"]],
  ["站点名称",["Site name","사이트 이름","サイト名"]],
  ["站点描述",["Site description","사이트 설명","サイトの説明"]],
  ["单文件上传上限（MiB）",["Per-file upload limit (MiB)","파일당 업로드 제한(MiB)","ファイルごとのアップロード上限（MiB）"]],
  ["保存",["Save","저장","保存"]],
  ["有效期",["Expiration","유효 기간","有効期限"]],
  ["保留当前有效期",["Keep current expiration","현재 유효 기간 유지","現在の有効期限を維持"]],
  ["1 小时",["1 hour","1시간","1時間"]],
  ["1 天",["1 day","1일","1日"]],
  ["7 天",["7 days","7일","7日"]],
  ["30 天",["30 days","30일","30日"]],
  ["永久",["Never expires","만료 없음","無期限"]],
  ["保存并复制",["Save and copy","저장 및 복사","保存してコピー"]],
  ["新名称",["New name","새 이름","新しい名前"]],
  ["浏览器拦截了新标签页，请允许弹出窗口后重试。",["Allow pop-ups and try again.","팝업을 허용한 후 다시 시도하세요.","ポップアップを許可して再試行してください。"]],
  ["随目录公开",["Shared via folder","폴더를 통해 공유됨","フォルダー経由で共有"]],
  ["已分享",["Shared","공유됨","共有済み"]],
  ["公开",["Public","공개","公開"]],
  ["已过期",["Expired","만료됨","期限切れ"]],
  ["未分享",["Private","비공개","非公開"]],
  ["永久有效",["Never expires","만료 없음","無期限"]],
  ["到期时间",["Expires","만료 시간","有効期限"]],
  ["已复制公开链接",["Public link copied","공개 링크를 복사했습니다","公開リンクをコピーしました"]],
  ["复制公开链接",["Copy public link","공개 링크 복사","公開リンクをコピー"]],
  ["分享",["Share","공유","共有"]],
  ["文件分享",["Shared file","공유 파일","共有ファイル"]],
  ["打开分享",["Open share","공유 열기","共有を開く"]],
  ["复制链接",["Copy link","링크 복사","リンクをコピー"]],
  ["修改有效期",["Change expiration","유효 기간 변경","有効期限を変更"]],
  ["撤销",["Revoke","취소","無効化"]],
  ["撤销链接",["Revoke link","링크 취소","リンクを無効化"]],
  ["已跳过",["Skipped","건너뜀","スキップ済み"]],
  ["更多操作",["More actions","추가 작업","その他の操作"]],
  ["预览",["Preview","미리보기","プレビュー"]],
  ["重命名",["Rename","이름 변경","名前を変更"]],
  ["标签",["Tags","태그","タグ"]],
  ["用逗号分隔标签",["Separate tags with commas","태그를 쉼표로 구분하세요","タグをカンマで区切ってください"]],
  ["删除",["Delete","삭제","削除"]],
  ["删除此目录及所有子项目，并尝试同步删除原始消息？",["Delete this folder and all its contents, and try to delete the original messages?","이 폴더와 모든 하위 항목을 삭제하고 원본 메시지 삭제를 시도할까요?","このフォルダーとすべての内容を削除し、元のメッセージの削除を試みますか？"]],
  ["删除此文件、撤销分享链接，并尝试同步删除原始消息？",["Delete this file, revoke its share link, and try to delete the original message?","이 파일을 삭제하고 공유 링크를 취소한 뒤 원본 메시지 삭제를 시도할까요?","このファイルを削除して共有リンクを無効にし、元のメッセージの削除を試みますか？"]],
  ["全局搜索",["Global search","전체 검색","全体検索"]],
  ["没有符合条件的项目。",["No matching items.","일치하는 항목이 없습니다.","一致する項目がありません。"]],
  ["拖放或粘贴文件，或点击「上传文件」。",["Drop or paste files, or click Upload files.","파일을 끌어 놓거나 붙여넣거나 파일 업로드를 누르세요.","ファイルをドロップまたは貼り付けるか、ファイルをアップロードを選択してください。"]],
  ["正在上传其他文件，请等待当前批次完成。",["An upload is in progress. Wait for it to finish.","업로드가 진행 중입니다. 완료될 때까지 기다려 주세요.","アップロード中です。完了までお待ちください。"]],
  ["退出批量",["Exit bulk selection","일괄 선택 종료","一括選択を終了"]],
  ["所选项目已在目标目录。",["The selected items are already in the destination folder.","선택한 항목이 이미 대상 폴더에 있습니다.","選択した項目はすでに移動先フォルダーにあります。"]],
  ["目录名称",["Folder name","폴더 이름","フォルダー名"]],
  ["设置已保存。其他地区可能稍后更新。",["Settings saved. Other regions may update shortly.","설정이 저장되었습니다. 다른 지역에는 잠시 후 적용될 수 있습니다.","設定を保存しました。他の地域への反映には時間がかかる場合があります。"]],
  ["已将「{name}」移到「{folder}」",["Moved “{name}” to “{folder}”","‘{name}’을(를) ‘{folder}’로 이동했습니다","「{name}」を「{folder}」に移動しました"]],
  ["撤销「{name}」的公开链接？",["Revoke the public link for “{name}”?","‘{name}’의 공개 링크를 취소할까요?","「{name}」の公開リンクを無効にしますか？"]],
  ["已撤销「{name}」的链接",["Revoked the link for “{name}”","‘{name}’의 링크를 취소했습니다","「{name}」のリンクを無効にしました"]],
  ["定位到 {path}",["Go to {path}","{path}(으)로 이동","{path} に移動"]],
  ["已选 {count} 项",["{count} selected","{count}개 선택됨","{count} 件選択中"]],
  ["选择 {name}",["Select {name}","{name} 선택","{name} を選択"]],
  ["删除选中的 {count} 项及其子项目，并尝试同步删除原始消息？",["Delete {count} selected items and their contents, and try to delete the original messages?","선택한 항목 {count}개와 하위 항목을 삭제하고 원본 메시지 삭제를 시도할까요?","選択した {count} 件とその内容を削除し、元のメッセージの削除を試みますか？"]],
  ["持有链接的人可以浏览、下载及上传此文件夹及其子文件夹内的文件。",["Anyone with the link can browse, download, and upload files in this folder and its subfolders.","링크가 있는 사람은 이 폴더와 하위 폴더에서 파일을 탐색, 다운로드 및 업로드할 수 있습니다.","リンクを知っている人は、このフォルダーとサブフォルダーのファイルを閲覧、ダウンロード、アップロードできます。"]],
  ["持有链接的人可以读取此文件。",["Anyone with the link can read this file.","링크가 있는 사람은 이 파일을 읽을 수 있습니다.","リンクを知っている人はこのファイルを閲覧できます。"]],
  ["部分旧文件未记录原始存储位置。只有这些文件确实存放在当前配置的位置时，才点击确定同步删除。",["Some older files have no record of their original location. Confirm only if those files are stored in the currently configured location.","일부 이전 파일의 원본 저장 위치가 기록되지 않았습니다. 현재 설정된 위치에 저장된 경우에만 확인하세요.","一部の古いファイルは元の保存先が記録されていません。現在の設定先に保存されている場合に限り確定してください。"]],
  ["从云盘移除这些旧文件，保留它们的原始消息？",["Remove these older files from the drive and keep their original messages?","이전 파일을 드라이브에서 제거하고 원본 메시지는 유지할까요?","古いファイルをドライブから削除し、元のメッセージを残しますか？"]],
  ["已从云盘移除 {count} 项",["Removed {count} items from the drive","드라이브에서 {count}개를 제거했습니다","ドライブから {count} 件を削除しました"]],
  ["，已确认清除 {count} 条原始消息",["; confirmed deletion of {count} original messages"," · 원본 메시지 {count}개 삭제 확인","。元のメッセージ {count} 件の削除を確認しました"]],
  ["，{count} 条原始消息未确认删除，请到原位置检查",["; check the original location for {count} messages whose deletion could not be confirmed"," · 원본 메시지 {count}개의 삭제를 확인할 수 없습니다. 원래 위치를 확인하세요","。元のメッセージ {count} 件の削除を確認できませんでした。元の場所を確認してください"]],
  ["已删除 {done}/{total} 项",["Deleted {done}/{total} items","{done}/{total}개 삭제 완료","{done}/{total} 件を削除しました"]],
  ["已移动 {done}/{total} 项",["Moved {done}/{total} items","{done}/{total}개 이동 완료","{done}/{total} 件を移動しました"]],
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

export let language = preferredLanguage();
export const translate = (source, values = {}) =>
  (messages.get(source)?.[languages.indexOf(language) - 1] ?? source)
    .replace(/\{(\w+)\}/g, (placeholder, key) => values[key] ?? placeholder);

const bindings = new WeakMap();

export function localizeValue(node, render, property = "textContent") {
  let properties = bindings.get(node);
  if (!properties) bindings.set(node, properties = new Map());
  properties.set(property, render);
  renderProperty(node, property, render);
}

export function clearLocalizedValue(node) {
  bindings.delete(node);
}

function renderProperty(node, property, render) {
  const value = render();
  if (property.startsWith("@")) node.setAttribute(property.slice(1), value);
  else node[property] = value;
}

export function localizeDrive() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const source = node.data.trim();
    if (messages.has(source)) {
      const original = node.data;
      localizeValue(node, () => original.replace(source, () => translate(source)), "data");
    }
  }
  for (const element of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const source = element.getAttribute(attribute);
      if (messages.has(source)) localizeValue(element, () => translate(source), "@" + attribute);
    }
  }
  const picker = document.querySelector("[data-drive-language]");
  function apply(next) {
    language = next;
    picker.value = language;
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    const nodes = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (nodes.nextNode()) {
      const node = nodes.currentNode;
      for (const [property, render] of bindings.get(node) ?? []) renderProperty(node, property, render);
    }
  }
  apply(language);
  picker.addEventListener("change", () => {
    apply(picker.value);
    try {
      localStorage.setItem("inbox-language", picker.value);
    } catch {}
  });
  window.addEventListener("storage", event => {
    if (event.storageArea === localStorage && (event.key === "inbox-language" || event.key === null)) {
      apply(preferredLanguage());
    }
  });
}
