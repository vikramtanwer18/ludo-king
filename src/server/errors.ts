/** A rule was broken; the message is safe to show to the player. */
export class Fail extends Error {}

export const fail = (msg: string): never => {
  throw new Fail(msg);
};
