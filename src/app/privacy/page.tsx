import Prose from "@/components/Prose";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <Prose title="Privacy" updated="October 2026">
      <p>Placeholder policy for the demo build. Replace with a reviewed policy before launch.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your name, email address and token colour.</li>
        <li>Matches you create or join, room codes, results and win screenshots.</li>
        <li>Notifications we send you in the app.</li>
      </ul>
      <h2>Who can see it</h2>
      <ul>
        <li>Other players see your name, colour, matches and leaderboard stats.</li>
        <li>Your email address is never shown to other players. We only use it to send your login codes.</li>
        <li>Win screenshots are visible only to the two players in that match and to support if a match is reviewed.</li>
      </ul>
      <h2>Your choices</h2>
      <p>Contact support to correct your details or delete your account and its data.</p>
    </Prose>
  );
}
