import Prose from "@/components/Prose";
import { APP } from "@/lib/config";

export const metadata = { title: "About" };

export default function About() {
  return (
    <Prose title={`About ${APP.name}`}>
      <p>{APP.name} helps friends find each other for a quick game of Ludo. Create a room, accept a player, share your Ludo King room code and post who won. Your wins add up on the leaderboard.</p>
      <p>Rooms have an entry amount paid from your wallet. Both players pay the same amount and the winner gets the pot minus a small platform fee. You add cash with UPI and withdraw to your bank account or UPI ID after KYC.</p>
      <p>{APP.name} is not affiliated with Ludo King or its makers. Ludo King is a trademark of its owner.</p>
    </Prose>
  );
}
