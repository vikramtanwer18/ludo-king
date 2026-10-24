import Prose from "@/components/Prose";
import { APP } from "@/lib/config";

export const metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <Prose title="Terms of use" updated="October 2026">
      <p>Placeholder terms for the demo build. Replace with text reviewed by the client&apos;s lawyer before launch.</p>
      <h2>Using the service</h2>
      <ul>
        <li>{APP.name} is a service for arranging Ludo matches with friends.</li>
        <li>You&apos;re responsible for the account registered to your email address.</li>
      </ul>
      <h2>Wallet, entry amounts and withdrawals</h2>
      <ul>
        <li>You can add ₹50 to ₹2,000 at a time to your wallet with UPI. Each room has an entry amount of ₹50 to ₹2,000, held from your wallet until the match ends.</li>
        <li>The winner receives both entries minus the platform fee shown when the room is created. Cancelled matches are refunded to both players.</li>
        <li>Withdrawals need approved KYC (PAN and a bank account or UPI ID in your name) and are reviewed before payment.</li>
      </ul>
      <h2>Fair play</h2>
      <ul>
        <li>Follow the <a href="/rules">fair-play rules</a>. Posting false results may lead to suspension.</li>
        <li>Be respectful to other players.</li>
      </ul>
      <h2>Third-party apps</h2>
      <p>Games are played in Ludo King, which has its own terms. We aren&apos;t responsible for that app.</p>
      <h2>Changes</h2>
      <p>We may update these terms. We&apos;ll show the date of the last change at the top of this page.</p>
    </Prose>
  );
}
