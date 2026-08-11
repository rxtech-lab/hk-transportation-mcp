import type { Locale } from "./i18n-provider";

/** Update when the policy text changes — rendered as the "last updated" date. */
export const PRIVACY_LAST_UPDATED = "2026-08-10";

/** Where privacy requests are sent. Replace with the real support address. */
export const PRIVACY_CONTACT_EMAIL = "privacy@rxlab.dev";

export interface PrivacySection {
  readonly heading: string;
  /** Rendered as paragraphs. */
  readonly body?: readonly string[];
  /** Rendered as a bulleted list below the paragraphs. */
  readonly bullets?: readonly string[];
}

export interface PrivacyContent {
  readonly title: string;
  readonly lastUpdatedLabel: string;
  readonly back: string;
  readonly intro: readonly string[];
  readonly sections: readonly PrivacySection[];
}

const enUS: PrivacyContent = {
  title: "Privacy Policy",
  lastUpdatedLabel: "Last updated",
  back: "Back to app",
  intro: [
    "HK Transportation is an AI assistant for Hong Kong public transit. This policy explains what the web app and the HK Transport mobile app collect, why, and who else sees it.",
    "There are no accounts and no sign-in. We do not sell your data, and we do not use it for advertising or profiling.",
  ],
  sections: [
    {
      heading: "What we collect",
      bullets: [
        "Location — your approximate GPS coordinates, only after you grant permission, and only to answer a query such as “buses near me”.",
        "Messages — what you type in the chat, plus the transit data returned for it (stops, routes, arrival times).",
        "Technical data — your IP address and standard request metadata, seen by our servers when the app makes a request.",
        "Preferences — your chosen language.",
      ],
    },
    {
      heading: "How we use it",
      bullets: [
        "To find nearby stops, routes, and real-time arrivals for your query.",
        "To generate the assistant's replies and decide which transit tools to call.",
        "To classify whether a message is a Hong Kong transport question, so off-topic requests are declined.",
        "To rate-limit abusive traffic, using a short-lived record keyed to your IP address.",
      ],
    },
    {
      heading: "Where your data is stored",
      body: [
        "Your conversation history lives on your own device — in your browser's local storage on the web, and in a local database on the mobile app. It is not stored on our servers, and it never leaves your device except as part of the request you send.",
        "Messages sent to us are processed in memory to produce a reply. A streaming response may be held briefly in a temporary cache (up to 5 minutes) so a reconnecting client can resume it. Server logs containing request metadata are retained for a short period for reliability and abuse prevention.",
      ],
    },
    {
      heading: "Clearing your data",
      body: [
        "Tapping “New chat” deletes the stored conversation from your device. Clearing your browser's site data, or uninstalling the mobile app, removes everything held locally.",
        "You can revoke location permission at any time in your browser or device settings. The assistant will still work, but you will need to name a place instead of using your current position.",
      ],
    },
    {
      heading: "Who else processes your data",
      body: [
        "We rely on a small number of service providers to run the app. They receive only what is needed to perform their function:",
      ],
      bullets: [
        "Vercel — hosting and serving the app.",
        "Vercel AI Gateway and the underlying AI model provider — receives your messages and location coordinates to generate a reply.",
        "Mapbox — serves map tiles and styles when a map is displayed.",
        "Upstash — temporary cache for resumable response streams and rate limiting.",
        "Hong Kong transit data sources (including KMB and Citybus open data) and OpenStreetMap Nominatim for place lookup — receive stop, route, or place queries derived from your request.",
      ],
    },
    {
      heading: "Children",
      body: [
        "This service is not directed at children under 13, and we do not knowingly collect their personal data.",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "Because we do not hold accounts or conversation history on our servers, most of your data is already under your direct control on your device. For any other request regarding data we hold, contact us and we will respond as required by applicable Hong Kong law, including the Personal Data (Privacy) Ordinance.",
      ],
    },
    {
      heading: "Changes to this policy",
      body: [
        "If this policy changes materially, we will update the date at the top of this page.",
      ],
    },
    {
      heading: "Contact",
      body: [
        `Questions about privacy? Email ${PRIVACY_CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const zhHK: PrivacyContent = {
  title: "私隱政策",
  lastUpdatedLabel: "最後更新",
  back: "返回應用程式",
  intro: [
    "「HK Transportation」是一個為香港公共交通而設的 AI 助手。本政策說明網頁版及 HK Transport 流動應用程式會收集甚麼資料、用途，以及有哪些第三方會接觸到這些資料。",
    "本服務毋須註冊或登入。我們不會出售你的資料，亦不會用作廣告或用戶分析。",
  ],
  sections: [
    {
      heading: "我們收集的資料",
      bullets: [
        "位置 — 你的大概 GPS 座標，只會在你授權後取得，並僅用於回應例如「附近有咩巴士」這類查詢。",
        "訊息 — 你在對話中輸入的內容，以及為此取得的交通資料（車站、路線、到站時間）。",
        "技術資料 — 應用程式發出請求時，我們的伺服器會看到你的 IP 位址及一般請求資料。",
        "偏好設定 — 你選擇的語言。",
      ],
    },
    {
      heading: "資料用途",
      bullets: [
        "為你的查詢尋找附近車站、路線及實時到站時間。",
        "生成助手的回覆，並決定需要呼叫哪些交通查詢工具。",
        "判斷訊息是否與香港交通有關，以便拒絕無關的查詢。",
        "以你的 IP 位址作短暫紀錄，限制濫用流量。",
      ],
    },
    {
      heading: "資料儲存位置",
      body: [
        "你的對話紀錄儲存在你自己的裝置上 — 網頁版存放於瀏覽器的本機儲存空間，流動應用程式則存放於本機資料庫。我們的伺服器不會保存這些紀錄；除了你主動發送的請求內容外，紀錄不會離開你的裝置。",
        "發送給我們的訊息只會在記憶體中處理以生成回覆。串流回覆可能會短暫存放於暫存快取（最多 5 分鐘），讓重新連線的裝置可以續傳。含請求資料的伺服器日誌會短期保留，用於系統穩定及防止濫用。",
      ],
    },
    {
      heading: "清除你的資料",
      body: [
        "按「新對話」即可從裝置刪除已儲存的對話。清除瀏覽器的網站資料或解除安裝流動應用程式，會移除所有本機儲存的內容。",
        "你可隨時於瀏覽器或裝置設定中撤回位置權限。助手仍可使用，但你需要自行輸入地點而非使用目前位置。",
      ],
    },
    {
      heading: "會接觸資料的第三方",
      body: [
        "我們使用少量服務供應商營運本應用程式，他們只會取得執行其功能所需的資料：",
      ],
      bullets: [
        "Vercel — 提供寄存及應用程式服務。",
        "Vercel AI Gateway 及底層 AI 模型供應商 — 接收你的訊息及位置座標以生成回覆。",
        "Mapbox — 在顯示地圖時提供地圖圖磚及樣式。",
        "Upstash — 用作可續傳回覆串流的暫存快取及流量限制。",
        "香港交通資料來源（包括九巴及城巴公開資料）及 OpenStreetMap Nominatim 地點搜尋 — 接收由你的請求衍生的車站、路線或地點查詢。",
      ],
    },
    {
      heading: "兒童",
      body: ["本服務並非以 13 歲以下兒童為對象，我們亦不會在知情下收集其個人資料。"],
    },
    {
      heading: "你的權利",
      body: [
        "由於我們的伺服器不設帳戶，亦不保存對話紀錄，你的大部分資料已直接由你在裝置上控制。如對我們持有的其他資料有任何要求，請與我們聯絡，我們會按適用的香港法例（包括《個人資料（私隱）條例》）處理。",
      ],
    },
    {
      heading: "政策修訂",
      body: ["如本政策有重大修改，我們會更新本頁頂部的日期。"],
    },
    {
      heading: "聯絡我們",
      body: [`對私隱有疑問？請電郵至 ${PRIVACY_CONTACT_EMAIL}。`],
    },
  ],
};

const zhTW: PrivacyContent = {
  title: "隱私權政策",
  lastUpdatedLabel: "最後更新",
  back: "返回應用程式",
  intro: [
    "「HK Transportation」是專為香港大眾運輸打造的 AI 助理。本政策說明網頁版與 HK Transport 行動應用程式會收集哪些資料、用途，以及有哪些第三方會接觸這些資料。",
    "本服務不需註冊或登入。我們不會販售你的資料，也不會用於廣告或用戶分析。",
  ],
  sections: [
    {
      heading: "我們收集的資料",
      bullets: [
        "位置 — 你的概略 GPS 座標，僅在你授權後取得，且只用於回應例如「附近的公車」這類查詢。",
        "訊息 — 你在對話中輸入的內容，以及為此取得的運輸資料（站點、路線、到站時間）。",
        "技術資料 — 應用程式發出請求時，我們的伺服器會看到你的 IP 位址與一般請求資訊。",
        "偏好設定 — 你選擇的語言。",
      ],
    },
    {
      heading: "資料用途",
      bullets: [
        "為你的查詢尋找鄰近站點、路線與即時到站時間。",
        "生成助理的回覆，並決定需要呼叫哪些運輸查詢工具。",
        "判斷訊息是否與香港交通相關，以便婉拒無關的查詢。",
        "以你的 IP 位址建立短暫紀錄，用於限制濫用流量。",
      ],
    },
    {
      heading: "資料儲存位置",
      body: [
        "你的對話紀錄儲存在你自己的裝置上 — 網頁版存放於瀏覽器的本機儲存空間，行動應用程式則存放於本機資料庫。我們的伺服器不會保存這些紀錄；除了你主動送出的請求內容外，紀錄不會離開你的裝置。",
        "傳送給我們的訊息僅在記憶體中處理以生成回覆。串流回覆可能會短暫存放於暫存快取（最多 5 分鐘），讓重新連線的裝置可以續傳。含請求資訊的伺服器日誌會短期保留，用於系統穩定與防止濫用。",
      ],
    },
    {
      heading: "清除你的資料",
      body: [
        "點選「新對話」即可從裝置刪除已儲存的對話。清除瀏覽器的網站資料或解除安裝行動應用程式，會移除所有本機儲存的內容。",
        "你可隨時於瀏覽器或裝置設定中撤銷位置權限。助理仍可使用，但你需要自行輸入地點而非使用目前位置。",
      ],
    },
    {
      heading: "會接觸資料的第三方",
      body: ["我們使用少數服務供應商營運本應用程式，他們只會取得執行其功能所需的資料："],
      bullets: [
        "Vercel — 提供代管與應用程式服務。",
        "Vercel AI Gateway 及底層 AI 模型供應商 — 接收你的訊息與位置座標以生成回覆。",
        "Mapbox — 在顯示地圖時提供地圖圖磚與樣式。",
        "Upstash — 用於可續傳回覆串流的暫存快取與流量限制。",
        "香港運輸資料來源（包括九巴與城巴公開資料）及 OpenStreetMap Nominatim 地點搜尋 — 接收由你的請求衍生的站點、路線或地點查詢。",
      ],
    },
    {
      heading: "兒童",
      body: ["本服務並非以 13 歲以下兒童為對象，我們也不會在知情下收集其個人資料。"],
    },
    {
      heading: "你的權利",
      body: [
        "由於我們的伺服器不設帳戶，也不保存對話紀錄，你的大部分資料已直接由你在裝置上掌控。如對我們持有的其他資料有任何要求，請與我們聯絡，我們會依適用的香港法例（包括《個人資料（私隱）條例》）處理。",
      ],
    },
    {
      heading: "政策修訂",
      body: ["如本政策有重大變更，我們會更新本頁頂端的日期。"],
    },
    {
      heading: "聯絡我們",
      body: [`對隱私權有疑問？請來信 ${PRIVACY_CONTACT_EMAIL}。`],
    },
  ],
};

const zhCN: PrivacyContent = {
  title: "隐私政策",
  lastUpdatedLabel: "最后更新",
  back: "返回应用",
  intro: [
    "“HK Transportation”是一款面向香港公共交通的 AI 助手。本政策说明网页版与 HK Transport 移动应用会收集哪些数据、用途，以及哪些第三方会接触这些数据。",
    "本服务无需注册或登录。我们不会出售你的数据，也不会用于广告或用户画像。",
  ],
  sections: [
    {
      heading: "我们收集的信息",
      bullets: [
        "位置 — 你的大致 GPS 坐标，仅在你授权后获取，且只用于回应例如“附近的公交”这类查询。",
        "消息 — 你在对话中输入的内容，以及为此获取的交通数据（站点、线路、到站时间）。",
        "技术数据 — 应用发出请求时，我们的服务器会看到你的 IP 地址和常规请求信息。",
        "偏好设置 — 你选择的语言。",
      ],
    },
    {
      heading: "信息用途",
      bullets: [
        "为你的查询查找附近站点、线路和实时到站时间。",
        "生成助手的回复，并决定需要调用哪些交通查询工具。",
        "判断消息是否与香港交通相关，以便拒绝无关的请求。",
        "以你的 IP 地址创建短期记录，用于限制滥用流量。",
      ],
    },
    {
      heading: "数据存储位置",
      body: [
        "你的对话记录保存在你自己的设备上 — 网页版存放于浏览器的本地存储，移动应用则存放于本地数据库。我们的服务器不会保存这些记录；除你主动发送的请求内容外，记录不会离开你的设备。",
        "发送给我们的消息仅在内存中处理以生成回复。流式回复可能会短暂存放于临时缓存（最多 5 分钟），以便重新连接的设备继续接收。包含请求信息的服务器日志会短期保留，用于系统稳定与防止滥用。",
      ],
    },
    {
      heading: "清除你的数据",
      body: [
        "点击“新对话”即可从设备删除已保存的对话。清除浏览器的网站数据或卸载移动应用，会移除所有本地保存的内容。",
        "你可随时在浏览器或设备设置中撤销位置权限。助手仍可使用，但你需要自行输入地点而非使用当前位置。",
      ],
    },
    {
      heading: "会接触数据的第三方",
      body: ["我们使用少量服务提供商运行本应用，他们只会获得执行其功能所需的数据："],
      bullets: [
        "Vercel — 提供托管与应用服务。",
        "Vercel AI Gateway 及底层 AI 模型提供商 — 接收你的消息与位置坐标以生成回复。",
        "Mapbox — 在显示地图时提供地图瓦片与样式。",
        "Upstash — 用于可续传回复流的临时缓存与流量限制。",
        "香港交通数据来源（包括九巴与城巴公开数据）及 OpenStreetMap Nominatim 地点搜索 — 接收由你的请求衍生的站点、线路或地点查询。",
      ],
    },
    {
      heading: "儿童",
      body: ["本服务并非面向 13 岁以下儿童，我们也不会在知情的情况下收集其个人信息。"],
    },
    {
      heading: "你的权利",
      body: [
        "由于我们的服务器不设账户，也不保存对话记录，你的大部分数据已由你在设备上直接掌控。如对我们持有的其他数据有任何请求，请与我们联系，我们会依据适用的香港法律（包括《个人资料（私隐）条例》）处理。",
      ],
    },
    {
      heading: "政策变更",
      body: ["如本政策有重大变更，我们会更新本页顶部的日期。"],
    },
    {
      heading: "联系我们",
      body: [`对隐私有疑问？请发送邮件至 ${PRIVACY_CONTACT_EMAIL}。`],
    },
  ],
};

export const privacyContent: Record<Locale, PrivacyContent> = {
  "en-US": enUS,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
  "zh-CN": zhCN,
};
