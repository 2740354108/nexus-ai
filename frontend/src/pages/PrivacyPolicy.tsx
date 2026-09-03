import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<"zh" | "en">("zh");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const sections = [
    {
      title: "1. 引言",
      enTitle: "1. Introduction",
      body: "NEXUS LAB（以下简称「我们」或「本平台」）重视用户的隐私保护。本隐私政策说明我们如何收集、使用、存储、共享和保护您在使用 NEXUS LAB 网站、移动应用及相关服务（统称「服务」）时提供的个人信息。访问或使用本服务，即表示您同意本政策的全部内容。",
      enBody:
        "NEXUS LAB (\"we\", \"us\", or \"the Platform\") values your privacy. This Privacy Policy explains how we collect, use, store, share, and protect the personal information you provide when using the NEXUS LAB website, mobile applications, and related services (collectively, the \"Service\"). By accessing or using the Service, you agree to all the terms of this Policy.",
    },
    {
      title: "2. 我们收集的信息",
      enTitle: "2. Information We Collect",
      body: "为向您提供个性化与高质量的服务，我们可能收集以下信息：（a）账户注册信息，如邮箱地址、手机号（可选）、密码（经加密存储）及头像；（b）使用数据，包括访问时间、页面浏览、设备与浏览器类型、IP 地址；（c）您主动上传或生成的内容，如提示词、生成的图片、音频、视频、代码；（d）通过第三方授权登录（如 Google）时获得的公开资料（如邮箱、昵称、头像）。",
      enBody:
        "To provide a personalized and high-quality service, we may collect: (a) account information such as email address, phone number (optional), encrypted password, and avatar; (b) usage data including access time, pages viewed, device and browser type, and IP address; (c) content you upload or generate, such as prompts, images, audio, video, and code; (d) public profile data obtained through third-party sign-in (e.g., Google), such as email, display name, and avatar.",
    },
    {
      title: "3. 第三方服务提供商",
      enTitle: "3. Third-Party Service Providers",
      body: "为支撑服务运转，我们会与以下受信任的第三方共享必要数据，且这些第三方须遵守相应的隐私义务：（a）Agnes AI（apihub.agnes-ai.cn）：用于执行文生图、文生视频、图生视频等 AI 生成任务，会接收您提交的提示词与素材；（b）Google Identity Services：用于一键登录，仅在您选择 Google 登录时获取您的公开资料；（c）QQ 邮箱 SMTP：用于向您发送验证码邮件；（d）腾讯云 CloudBase（TCB）：作为本平台的数据库与存储托管方，持有您的账户与内容数据。上述第三方均受其各自隐私政策约束。",
      enBody:
        "To operate the Service, we share necessary data with the following trusted third parties, each bound by their own privacy obligations: (a) Agnes AI (apihub.agnes-ai.cn) processes your prompts and assets to perform AI generation tasks such as text-to-image and text/video; (b) Google Identity Services is used for one-click sign-in and only accesses your public profile when you choose Google login; (c) QQ Mail SMTP is used to send verification emails to you; (d) Tencent CloudBase (TCB) acts as our database and storage host, holding your account and content data. These providers are governed by their respective privacy policies.",
    },
    {
      title: "4. 信息的使用",
      enTitle: "4. How We Use Information",
      body: "我们仅将收集的信息用于：提供、维护和改进 NEXUS LAB 的各项功能；处理和存储您生成的内容；向您发送服务通知、安全提示和重要更新；分析和优化服务体验，防范欺诈与滥用行为；以及遵守法律法规和监管机构的要求。我们不会将您的信息用于未在本政策中声明的目的。",
      enBody:
        "We use the collected information solely to: provide, maintain, and improve NEXUS LAB features; process and store your generated content; send service notices, security alerts, and important updates; analyze and optimize the experience; prevent fraud and abuse; and comply with legal and regulatory requirements. We will not use your information for purposes not stated in this Policy.",
    },
    {
      title: "5. 信息的共享与披露",
      enTitle: "5. Sharing and Disclosure",
      body: "除非获得您的明确同意，或根据法律法规要求，我们不会将您的个人信息出售、出租或以其他方式提供给第三方。我们仅在第 3 条所列场景中与受信任的服务提供商共享必要数据，且这些第三方须遵守同等保密义务。若因合并、收购或资产转让导致信息转移，我们将提前通知您。",
      enBody:
        "Except with your explicit consent or as required by law, we will not sell, rent, or otherwise provide your personal information to third parties. We only share necessary data with trusted providers as described in Section 3, who are bound by equivalent confidentiality obligations. In the event of a merger, acquisition, or asset transfer, we will notify you in advance.",
    },
    {
      title: "6. 数据存储与国际传输",
      enTitle: "6. Data Storage and International Transfers",
      body: "您的数据存储于腾讯云 CloudBase 托管的服务器上，可能因云服务架构而涉及跨境传输与存储。我们采取合理的合同与技术措施，保障跨境传输过程中的数据安全。继续使用本服务即表示您理解并同意此类传输。",
      enBody:
        "Your data is stored on servers hosted by Tencent CloudBase, which may involve cross-border transfer and storage due to cloud architecture. We apply reasonable contractual and technical measures to protect data during such transfers. By continuing to use the Service, you understand and consent to these transfers.",
    },
    {
      title: "7. 数据保留期限",
      enTitle: "7. Data Retention",
      body: "我们仅在实现本政策所述目的所需期限内保留您的个人信息。账户存续期间，您的资料与生成内容将被持续保存；当您注销账户后，我们将在 30 天内删除或匿名化处理您的个人数据，法律法规要求长期保存的除外。",
      enBody:
        "We retain your personal information only for as long as necessary for the purposes described in this Policy. While your account is active, your profile and generated content are retained; within 30 days after you delete your account, we will delete or anonymize your personal data, except where longer retention is required by law.",
    },
    {
      title: "8. 您的权利",
      enTitle: "8. Your Rights",
      body: "您有权访问、更正、删除或导出您的个人信息，也可以随时撤回授权、注销账户。如需行使上述权利，可通过本平台「我的空间」中的账户设置或发送邮件至 2740354108@qq.com 提交申请，我们将在合理期限内处理。部分地区法律（如 GDPR、CCPA）可能赋予您额外的数据权利。",
      enBody:
        "You have the right to access, correct, delete, or export your personal information, and to withdraw consent or delete your account at any time. To exercise these rights, use the account settings in \"My Space\" or email 2740354108@qq.com. We will respond within a reasonable period. Certain laws (e.g., GDPR, CCPA) may grant you additional rights.",
    },
    {
      title: "9. 数据安全",
      enTitle: "9. Data Security",
      body: "我们采取合理的技术和管理措施保护您的数据安全，包括加密传输、访问控制、密码加盐哈希存储、定期安全审计等。但互联网环境不存在绝对安全，请您妥善保管账户密码，并在发现异常情况时立即与我们联系。",
      enBody:
        "We apply reasonable technical and organizational measures to protect your data, including encrypted transmission, access controls, salted password hashing, and periodic security audits. No internet environment is absolutely secure; please safeguard your password and contact us immediately if you notice any anomaly.",
    },
    {
      title: "10. Cookie 与同类技术",
      enTitle: "10. Cookies and Similar Technologies",
      body: "我们使用 Cookie 及同类技术来识别您的设备、维持登录状态、记录偏好设置、分析网站使用情况。您可以通过浏览器设置拒绝或管理 Cookie，但部分功能（如保持登录）可能因此受到影响。",
      enBody:
        "We use cookies and similar technologies to identify your device, maintain your login session, remember preferences, and analyze usage. You may refuse or manage cookies via your browser settings, but some features (such as staying logged in) may be affected.",
    },
    {
      title: "11. 未成年人保护",
      enTitle: "11. Children's Privacy",
      body: "NEXUS LAB 不主动面向 14 岁以下未成年人提供服务。若我们发现收集了未成年人的个人信息，将尽快删除或进行匿名化处理。如您是未成年人，请在监护人陪同下使用本服务。",
      enBody:
        "NEXUS LAB is not directed to children under 14. If we discover that we have collected personal information from a minor, we will delete or anonymize it promptly. Minors should use the Service only with parental supervision.",
    },
    {
      title: "12. 政策更新",
      enTitle: "12. Changes to This Policy",
      body: "我们可能会根据服务变化或法律法规要求不定期修订本政策。更新后的政策将在本页面发布并标注新的生效日期，请定期查阅。重大变更时，我们会通过网站公告或邮件通知您。",
      enBody:
        "We may revise this Policy from time to time to reflect service changes or legal requirements. The updated Policy will be posted on this page with a new effective date; please review it periodically. For significant changes, we will notify you via website notice or email.",
    },
    {
      title: "13. 联系我们",
      enTitle: "13. Contact Us",
      body: "如对本隐私政策有任何疑问、意见或投诉，请通过官网「联系我们」入口或发送邮件至 2740354108@qq.com 与我们联系。我们将在合理期限内予以回复。",
      enBody:
        "If you have any questions, comments, or complaints about this Privacy Policy, please contact us through the \"Contact Us\" entry on the website or by emailing 2740354108@qq.com. We will respond within a reasonable period.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              NEXUS<span className="text-gradient-neon ml-1">LAB</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  lang === "zh"
                    ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  lang === "en"
                    ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                EN
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              {lang === "zh" ? "返回" : "Back"}
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-12 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {lang === "zh" ? "隐私政策" : "Privacy Policy"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "zh"
                ? "Privacy Policy · 最后更新日期：2026 年 9 月 3 日"
                : "Last updated: September 3, 2026"}
            </p>
          </div>

          <div className="space-y-10 rounded-2xl border border-white/5 bg-card/40 p-8 shadow-2xl sm:p-10">
            {sections.map((section) => (
              <section key={section.title} className="scroll-mt-28">
                <h2 className="mb-2 text-lg font-semibold text-white">
                  {lang === "zh" ? section.title : section.enTitle}
                </h2>
                <p className="leading-relaxed text-muted-foreground">
                  {lang === "zh" ? section.body : section.enBody}
                </p>
              </section>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-sm text-muted-foreground sm:flex-row">
            <p>
              {lang === "zh"
                ? "© 2026 NEXUS LAB. 保留所有权利"
                : "© 2026 NEXUS LAB. All rights reserved."}
            </p>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="text-white transition-colors hover:text-cyan-300">
                {lang === "zh" ? "隐私政策" : "Privacy Policy"}
              </Link>
              <Link to="/terms" className="transition-colors hover:text-white">
                {lang === "zh" ? "服务条款" : "Terms of Service"}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
