import Prose from "@/components/Prose";
import { RULES } from "@/lib/config";

export const metadata = { title: "Fair-play rules" };

export default function Rules() {
  return (
    <Prose title="Fair-play rules">
      <p>Matches are played in the Ludo King app. This app only helps you find a player, share the room code and record who won.</p>

      <h2>Starting a match</h2>
      <ul>
        <li>You can have up to {RULES.maxOpenMatches} open rooms at a time.</li>
        <li>You can&apos;t create or join a room while you have a running match without a posted result.</li>
        <li>After the host accepts a player, they have {RULES.roomCodeMinutes} minutes to share the Ludo King room code. If they don&apos;t, the match is cancelled.</li>
        <li>Share a code for the same game mode as the room. Classic rooms use Classic codes.</li>
      </ul>

      <h2>Leaving a game</h2>
      <ul>
        <li>If you leave a Ludo King game on purpose after tokens are out, post “I lost”.</li>
        <li>If neither player has moved a token out, either player can post “Cancel”.</li>
        <li>Record your screen during the game. It helps if a result is questioned.</li>
      </ul>

      <h2>Posting results</h2>
      <ul>
        <li>Post your result within {RULES.resultMinutes} minutes of the first result. After that, your opponent&apos;s result stands.</li>
        <li>Winners add a screenshot of the Ludo King win screen. A wrong or edited screenshot sends the match to review.</li>
        <li>Posting “I lost” ends the match straight away.</li>
        <li>Results can&apos;t be changed after posting. Check before you tap.</li>
      </ul>

      <h2>When results don&apos;t match</h2>
      <p>If both players say they won, or one says won and the other says cancel, the match goes to review. Contact support with your screenshot or recording.</p>

      <h2>Accounts</h2>
      <ul>
        <li>One account per person.</li>
        <li>Accounts that repeatedly post false results may be suspended.</li>
      </ul>
    </Prose>
  );
}
