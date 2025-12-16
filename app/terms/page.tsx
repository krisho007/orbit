import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service - Orbit',
  description: 'Terms of Service for Orbit Personal CRM',
}

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          <div className="space-y-4">
            <Link 
              href="/"
              className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ← Back to Home
            </Link>
            <h1 className="text-4xl font-bold text-gray-900">Terms of Service</h1>
            <p className="text-gray-600">Last updated: December 10, 2025</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-6">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">1. Agreement to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing or using Orbit ("Service", "Application", "we", "us", or "our"), you agree to be bound 
                by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access 
                the Service.
              </p>
              <p className="text-gray-700 leading-relaxed">
                These Terms apply to all visitors, users, and others who access or use the Service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed">
                Orbit is a personal Customer Relationship Management (CRM) application that helps you manage 
                your contacts, conversations, events, and relationships. The Service includes:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Contact management and organization</li>
                <li>Conversation tracking across multiple communication mediums</li>
                <li>Event scheduling and participant management</li>
                <li>Relationship mapping between contacts</li>
                <li>AI-powered assistant for natural language data entry and queries</li>
                <li>File storage for contact images</li>
                <li>Custom tagging and categorization</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">3. User Accounts</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">3.1 Account Creation</h3>
              <p className="text-gray-700 leading-relaxed">
                To use Orbit, you must create an account by signing in with Google OAuth. You agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account</li>
                <li>Be responsible for all activities under your account</li>
                <li>Notify us immediately of any unauthorized use</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">3.2 Account Eligibility</h3>
              <p className="text-gray-700 leading-relaxed">
                You must be at least 13 years old to use this Service. By using Orbit, you represent and warrant 
                that you meet this age requirement.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">3.3 Account Termination</h3>
              <p className="text-gray-700 leading-relaxed">
                You may delete your account at any time through the settings page. We reserve the right to suspend 
                or terminate your account if you violate these Terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">4. Acceptable Use Policy</h2>
              <p className="text-gray-700 leading-relaxed">You agree NOT to use the Service to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Violate any laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Upload malicious code, viruses, or harmful software</li>
                <li>Harass, abuse, or harm others</li>
                <li>Collect data about other users without consent</li>
                <li>Impersonate any person or entity</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with the proper functioning of the Service</li>
                <li>Use automated scripts or bots to access the Service</li>
                <li>Store illegal, offensive, or inappropriate content</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">5. User Content</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">5.1 Your Content</h3>
              <p className="text-gray-700 leading-relaxed">
                You retain all rights to the content you create, upload, or store in Orbit ("User Content"), including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Contact information and notes</li>
                <li>Conversation records</li>
                <li>Event details</li>
                <li>Uploaded images and files</li>
                <li>Tags and custom data</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">5.2 Content License</h3>
              <p className="text-gray-700 leading-relaxed">
                By uploading User Content, you grant us a limited license to store, process, and display your content 
                solely for the purpose of providing the Service to you. We will not use your content for any other purpose 
                without your consent.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">5.3 Content Responsibility</h3>
              <p className="text-gray-700 leading-relaxed">
                You are solely responsible for your User Content. You warrant that you have the right to upload and store 
                all content in your account and that it does not violate any laws or third-party rights.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">5.4 Content Removal</h3>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to remove any User Content that violates these Terms or applicable laws, or that 
                we determine to be harmful to the Service or other users.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">6. AI Assistant Feature</h2>
              <p className="text-gray-700 leading-relaxed">
                Our AI assistant uses OpenAI's technology to process your natural language requests. By using this feature:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>You acknowledge that AI responses may not always be accurate</li>
                <li>You agree that your queries may be processed by third-party AI services</li>
                <li>You understand that we do not use your data to train AI models</li>
                <li>You remain responsible for verifying AI-generated content</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">7. Intellectual Property</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">7.1 Our Property</h3>
              <p className="text-gray-700 leading-relaxed">
                The Service, including its design, code, features, and functionality, is owned by us and protected by 
                copyright, trademark, and other intellectual property laws. You may not:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Copy, modify, or create derivative works of the Service</li>
                <li>Reverse engineer or decompile the Service</li>
                <li>Remove or alter any copyright or proprietary notices</li>
                <li>Use our trademarks without permission</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">7.2 Open Source</h3>
              <p className="text-gray-700 leading-relaxed">
                Orbit is distributed under the MIT License. The source code is available for use, modification, and 
                distribution subject to the terms of that license. However, using the hosted Service is subject to 
                these Terms of Service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">8. Privacy and Data Protection</h2>
              <p className="text-gray-700 leading-relaxed">
                Your privacy is important to us. Please review our <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700">Privacy Policy</Link> to 
                understand how we collect, use, and protect your personal information. By using the Service, you 
                consent to our data practices as described in the Privacy Policy.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">9. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">
                Our Service integrates with third-party services:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li><strong>Google OAuth:</strong> For authentication</li>
                <li><strong>Supabase:</strong> For database and storage</li>
                <li><strong>OpenAI:</strong> For AI assistant functionality</li>
                <li><strong>Vercel:</strong> For hosting</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                These services have their own terms and policies. We are not responsible for their practices or any 
                issues arising from their services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">10. Service Availability</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">10.1 Availability</h3>
              <p className="text-gray-700 leading-relaxed">
                We strive to provide reliable service but do not guarantee that the Service will be uninterrupted, 
                timely, secure, or error-free. We may suspend or discontinue the Service for maintenance or updates.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">10.2 Modifications</h3>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with or 
                without notice. We will not be liable for any modification, suspension, or discontinuation.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">11. Disclaimers</h2>
              <p className="text-gray-700 leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR 
                IMPLIED, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Warranties of merchantability</li>
                <li>Fitness for a particular purpose</li>
                <li>Non-infringement</li>
                <li>Accuracy, reliability, or completeness of content</li>
                <li>Security or privacy of data</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                We do not warrant that the Service will meet your requirements or that it will be error-free or secure.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">12. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Loss of profits, data, or use</li>
                <li>Business interruption</li>
                <li>Personal injury or property damage</li>
                <li>Loss of privacy</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Our total liability shall not exceed $100 or the amount you paid us in the last 12 months, whichever 
                is greater.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">13. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to indemnify, defend, and hold harmless Orbit, its officers, directors, employees, and agents 
                from any claims, liabilities, damages, losses, and expenses (including legal fees) arising from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Your use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any rights of another party</li>
                <li>Your User Content</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">14. Data Backup and Loss</h2>
              <p className="text-gray-700 leading-relaxed">
                While we implement backup procedures, you are responsible for maintaining your own backup copies of 
                important data. We are not liable for any data loss, corruption, or destruction.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">15. Governing Law</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in 
                which we operate, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">16. Dispute Resolution</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">16.1 Informal Resolution</h3>
              <p className="text-gray-700 leading-relaxed">
                If you have any dispute with us, please contact us first to attempt an informal resolution.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">16.2 Arbitration</h3>
              <p className="text-gray-700 leading-relaxed">
                Any disputes that cannot be resolved informally shall be resolved through binding arbitration, except 
                where prohibited by law. You waive your right to a jury trial.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">16.3 Class Action Waiver</h3>
              <p className="text-gray-700 leading-relaxed">
                You agree to resolve disputes on an individual basis and waive your right to participate in any class 
                action or representative proceeding.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">17. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of material changes by:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Updating the "Last updated" date</li>
                <li>Posting a notice in the application</li>
                <li>Sending an email notification (for significant changes)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your continued use of the Service after changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">18. Termination</h2>
              <p className="text-gray-700 leading-relaxed">
                We may terminate or suspend your account immediately, without prior notice, if you breach these Terms. 
                Upon termination:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Your right to use the Service will cease immediately</li>
                <li>We may delete your account and data</li>
                <li>Sections that by their nature should survive will remain in effect</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">19. Severability</h2>
              <p className="text-gray-700 leading-relaxed">
                If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited 
                or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">20. Entire Agreement</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms, together with our Privacy Policy, constitute the entire agreement between you and us 
                regarding the Service and supersede all prior agreements.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">21. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-gray-700">
                  <strong>Email:</strong> legal@orbit-crm.com<br />
                  <strong>Website:</strong> <Link href="/" className="text-indigo-600 hover:text-indigo-700">orbit-crm.com</Link>
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">22. Assignment</h2>
              <p className="text-gray-700 leading-relaxed">
                You may not assign or transfer these Terms without our written consent. We may assign these Terms 
                without restriction.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">23. Waiver</h2>
              <p className="text-gray-700 leading-relaxed">
                Our failure to enforce any right or provision of these Terms will not be considered a waiver of those 
                rights. Any waiver must be in writing and signed by us.
              </p>
            </section>

            <div className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-sm text-gray-600">
                By using Orbit, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




