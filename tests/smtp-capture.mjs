// Local SMTP server for tests: behaves like Gmail (needs a username + password) and saves every
// message to a JSON file the test suites read codes from.
//   node tests/smtp-capture.mjs ./inbox.json
// Start the app with: SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false
//   SMTP_USER=sender@gmail.com SMTP_PASS="abcd efgh ijkl mnop"
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import fs from "node:fs";
const OUT = process.argv[2] || "./inbox.json";
const USER = "sender@gmail.com", PASS = "abcd efgh ijkl mnop";
fs.writeFileSync(OUT, "[]");
const server = new SMTPServer({
  secure: false,
  disabledCommands: ["STARTTLS"],
  allowInsecureAuth: true,
  authMethods: ["PLAIN", "LOGIN"],
  onAuth(auth, _s, cb) {
    if (auth.username === USER && auth.password === PASS) return cb(null, { user: USER });
    cb(new Error("535 Username and Password not accepted"));
  },
  async onData(stream, session, cb) {
    const m = await simpleParser(stream);
    const box = JSON.parse(fs.readFileSync(OUT, "utf8"));
    box.push({
      authUser: session.user, envelopeTo: session.envelope.rcptTo.map((r) => r.address),
      from: m.from?.text, to: m.to?.text, subject: m.subject, text: m.text, html: m.html || "",
    });
    fs.writeFileSync(OUT, JSON.stringify(box, null, 1));
    cb();
  },
});
server.listen(2525, "127.0.0.1", () => console.log("SMTP capture listening on 2525"));
