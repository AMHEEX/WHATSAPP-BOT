module.exports = {
  name: "ping",
  commands: ["ping"],
  handle: async (m) => {
    await m.sendReply("Pong! CMD funcionando.");
  },
};
