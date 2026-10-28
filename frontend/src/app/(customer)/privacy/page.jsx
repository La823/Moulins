const EFFECTIVE_DATE = "August 13, 2026";
const LAST_UPDATED = "October 28, 2026";

const SECTIONS = [
  { id: "information-we-collect", label: "1. Information We Collect" },
  { id: "how-we-use", label: "2. How We Use Your Information" },
  { id: "sharing", label: "3. How We Share Information" },
  { id: "storage-retention", label: "4. Data Storage and Retention" },
  { id: "your-choices", label: "5. Your Choices and Rights" },
  { id: "local-storage", label: "6. Cookies and Similar Technologies" },
  { id: "security", label: "7. Security of Data" },
  { id: "children", label: "8. Children's Privacy" },
  { id: "changes", label: "9. Changes to This Privacy Policy" },
  { id: "contact", label: "10. Contact Us" },
];

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 py-8 border-b border-gray-100 last:border-b-0">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-4 text-[15px] text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

function Sub({ children }) {
  return <h3 className="text-[15px] font-semibold text-gray-800 pt-2">{children}</h3>;
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-16 pb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-red-600 mb-3">Legal</p>
          <h1 className="text-3xl sm:text-4xl font-light text-gray-900">Privacy Policy</h1>
          <div className="text-sm text-gray-400 mt-3 space-y-1">
            <p>Effective Date: {EFFECTIVE_DATE}</p>
            <p>Last Updated: {LAST_UPDATED}</p>
            <p>Company Name: Moulins Pharmaceuticals Pvt Ltd</p>
            <p>App Name: Moulins Pharma</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-12 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-12">
        {/* TOC */}
        <nav className="hidden lg:block sticky top-24 self-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">On this page</p>
          <ol className="space-y-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Content */}
        <div className="min-w-0">
          <p className="text-[15px] text-gray-600 leading-relaxed pb-8 border-b border-gray-100">
            Moulins Pharmaceuticals Pvt Ltd (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the
            Moulins Pharma mobile application and the website moulinspharma.com (together, the
            &quot;Services&quot;). This Privacy Policy explains what personal data we collect when you use our
            Services, how we use and protect it, and the choices you have. It applies to our partners, their team
            members, doctors, and to guests who sign in to browse our product catalogue.
          </p>

          <Section id="information-we-collect" title="1. Information We Collect">
            <p>
              The information we collect depends on how you use our Services. We collect only what we need to
              provide them.
            </p>

            <Sub>Partner and other registered accounts</Sub>
            <p>
              To provide our B2B services, account management, and order processing, we collect the following
              types of information when you use our application:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Contact Information:</b> Such as your name, email address, physical business address, and
                phone number, which are required for account creation, billing, and communication.
              </li>
              <li>
                <b>Account Credentials &amp; Identifiers:</b> User IDs and authentication details necessary to
                secure your access.
              </li>
              <li>
                <b>Financial &amp; Transaction Information:</b> Purchase history and commercial order records
                required for business accounting, processing, and compliance.
              </li>
              <li>
                <b>Messages &amp; User Content:</b> In-app messages, uploaded images/photos shared within chat
                threads, and other user-generated content or custom notes.
              </li>
              <li>
                <b>App Activity &amp; Interactions:</b> Technical logs of app interactions and navigation to
                ensure proper functionality and performance.
              </li>
            </ul>

            <Sub>Guest accounts (Continue with Google)</Sub>
            <p>
              You can browse our product catalogue as a guest by signing in with your Google account. When you do,
              Google shares the following with us, with your permission: your <b>name</b>, <b>email address</b>,{" "}
              <b>profile picture</b>, and a <b>unique identifier</b> for your Google account. We never receive your
              Google password, and we do not access your Gmail, contacts, files, or any other Google data.
            </p>

            <Sub>Guest browsing activity</Sub>
            <p>
              While you are signed in as a guest, we record how you use our product catalogue so that we can
              understand which products are of interest and improve our Services. This record is limited to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>the products you view;</li>
              <li>the searches you make on our website, and the number of results returned;</li>
              <li>the product divisions and categories you browse;</li>
              <li>features you try that are available only to our partners, such as ordering or viewing rates;</li>
              <li>the date and time of each of the above, and of each time you sign in; and</li>
              <li>the type of browser and device you use to sign in (for example, &quot;Chrome on Android&quot;).</li>
            </ul>
            <p>
              This record does not include your IP address or location, and we do not track your activity on any
              other website or app.
            </p>

            <Sub>Partnership requests</Sub>
            <p>
              If you ask to become a partner, we collect the details you submit in the request: your business or
              firm name, contact name, phone number, city, and any message you include.
            </p>

            <Sub>Technical information</Sub>
            <p>
              Like most online services, our servers automatically keep standard technical logs of requests made to
              them, which include your IP address, browser type, and the time of the request. These logs are used
              only to keep our Services secure, reliable, and working properly.
            </p>
          </Section>

          <Section id="how-we-use" title="2. How We Use Your Information">
            <p>We use the collected data for the following legitimate business purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>App Functionality:</b> To operate our services, authenticate users, process your commercial
                orders, display purchase history, and deliver in-app messages and content.
              </li>
              <li>
                <b>Account Management:</b> To manage user accounts, verify credentials, and handle profile
                setups.
              </li>
              <li>
                <b>Guest Access:</b> To create and secure your guest account and let you browse our product
                catalogue.
              </li>
              <li>
                <b>Improving Our Products and Services:</b> To understand, in aggregate and per guest, which
                products and categories are viewed and searched for — for example, to find products people look for
                but cannot find — and to improve our catalogue, search, and website.
              </li>
              <li>
                <b>Partnership Requests:</b> To review your request, contact you about becoming a partner, and set
                up your partner account if we proceed.
              </li>
              <li>
                <b>Fraud Prevention, Security, and Compliance:</b> To monitor for unauthorized access, secure
                financial transactions, maintain legal compliance, and protect business integrity.
              </li>
            </ul>
            <p>
              We do not use your information for automated decision-making that has legal or similarly significant
              effects on you, and we do not use it to show you third-party advertising.
            </p>
          </Section>

          <Section id="sharing" title="3. How We Share Information">
            <p>
              We do not sell your personal data, and we do not share it with any external third parties for their
              marketing or commercial exploitation. We share information only as follows:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Within Moulins:</b> Our authorised staff can see guest account details, guest browsing activity,
                and partnership requests, so that they can respond to you and improve our Services.
              </li>
              <li>
                <b>Service Providers:</b> We use trusted providers to host and run our Services, such as cloud
                hosting, database, and file storage providers. They process data only on our behalf and under our
                instructions, and are not permitted to use it for their own purposes.
              </li>
              <li>
                <b>Google:</b> When you choose Continue with Google, Google processes your sign-in under its own
                Privacy Policy.
              </li>
              <li>
                <b>Legal Requirements:</b> Where required by law, regulation, legal process, or a lawful request by
                a public authority, or where necessary to protect the rights, property, or safety of Moulins, our
                users, or others.
              </li>
            </ul>
          </Section>

          <Section id="storage-retention" title="4. Data Storage and Retention">
            <p>
              All collected data is stored securely on our servers and those of our service providers, and is
              retained only as long as necessary to fulfill the purposes outlined in this policy, comply with our
              legal obligations, resolve disputes, and enforce our agreements. In particular:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Guest browsing activity</b> is kept for <b>6 months</b> and then deleted automatically.
              </li>
              <li>
                <b>Guest account details</b> and the record of your sign-ins are kept while your guest account
                exists, and deleted if you ask us to delete your account.
              </li>
              <li>
                <b>Partnership requests</b> are kept as business records for as long as needed to handle the
                request and for our legitimate business and legal purposes.
              </li>
              <li>
                <b>Partner account and transaction records</b> are kept for as long as your account is active and
                thereafter as required by applicable tax, accounting, and other laws.
              </li>
            </ul>
          </Section>

          <Section id="your-choices" title="5. Your Choices and Rights">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Required Data:</b> Certain information — such as your name, email, address, phone number, and
                purchase history — is mandatory for account creation and order processing. Users cannot opt out
                of providing this data while maintaining an active commercial account.
              </li>
              <li>
                <b>Optional Data:</b> Features like uploading photos or sending specific in-app content are at
                your discretion.
              </li>
              <li>
                <b>Guest Accounts:</b> Signing in as a guest is optional. You can sign out at any time, and you can
                remove our access to your Google account from your Google Account settings, under &quot;Third-party
                apps and services.&quot; Signing out or removing access stops new activity being recorded; it does not
                by itself delete what we already hold.
              </li>
              <li>
                <b>Access, Correction, and Deletion:</b> Subject to applicable law, including India&apos;s Digital
                Personal Data Protection Act, 2023, you may ask us to access, correct, or delete your personal data,
                or to delete your guest account together with its browsing activity. To do so, email us at the
                address below from the email address on your account. We will respond within a reasonable time and
                in any case within the period required by law.
              </li>
            </ul>
          </Section>

          <Section id="local-storage" title="6. Cookies and Similar Technologies">
            <p>
              Our website keeps you signed in by storing a secure sign-in token in your browser&apos;s local storage,
              and remembers simple display preferences, such as how a product list is laid out. We do not use
              advertising cookies or third-party analytics or tracking tools. Signing out removes the sign-in token.
            </p>
          </Section>

          <Section id="security" title="7. Security of Data">
            <p>
              The security of your data is important to us. We implement appropriate technical and
              organizational security measures to protect your personal and financial information against
              unauthorized access, alteration, disclosure, or destruction. Data is transmitted over encrypted
              connections (HTTPS), and access to personal data within Moulins is limited to authorised staff who
              need it for their work.
            </p>
          </Section>

          <Section id="children" title="8. Children's Privacy">
            <p>
              Our Services are intended for healthcare businesses and professionals, and are not directed to
              children. We do not knowingly collect personal data from anyone under 18. If you believe a child has
              provided us with personal data, please contact us and we will delete it.
            </p>
          </Section>

          <Section id="changes" title="9. Changes to This Privacy Policy">
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting
              the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date above. Where a change is
              significant, we will also tell you through our Services.
            </p>
          </Section>

          <Section id="contact" title="10. Contact Us">
            <p>
              If you have any questions about this Privacy Policy, wish to exercise any of your rights, or have a
              concern about how we handle your data, please contact us:
            </p>
            <div className="not-prose bg-gray-50 rounded-xl border border-gray-200 p-5 text-[15px] text-gray-700">
              <p className="font-medium text-gray-900">Moulins Pharmaceuticals Pvt Ltd</p>
              <p>1st Floor, 363, Industrial Area Phase 2, Panchkula, Haryana 134113</p>
              <p className="mt-2">
                <a href="mailto:info@moulinspharma.com" className="text-red-600 hover:text-red-700">
                  info@moulinspharma.com
                </a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
