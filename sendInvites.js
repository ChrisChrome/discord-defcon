const Discord = require("discord.js");
const client = new Discord.Client({intents: ["GuildMembers", "DirectMessages"]});
const config = require("./config.json");

//const users = ["289884287765839882"]
const users = ["1100667180217016401", "1189636078920015963", "876951410665742368", "582569065210445834", "812898085856346172"];
const guildId = "1227352256094011513";
const channel = "1227353607750418472"
client.on('ready', () => {
	console.log("Getting ready to send messages...");
	var server;
	client.guilds.fetch(guildId).then((guild) => {
		server = guild
	})
	users.forEach(userId => {
		client.users.fetch(userId).then(user => {
			console.log(`Got ${user.displayName}!`);
			server.invites.create(channel, {
				maxAge: 21600,
				maxUses: 1,
				reason: "Invitation Approved by Chris",
				unique: true
			}).then(invite => {
				console.log(`Made invite "${invite.code}" for ${user.displayName}`);
				user.send({
					embeds: [
						{
							color: 0x00ff00,
							title: "Important Message from The Stash!",
							description: `You've been invited to join a super secret staff-only Discord server, where you can directly talk to, and report users to server staff!\nIt's recommended you join as soon as you can, the invite provided will expire <t:${Math.floor(new Date(invite.expiresAt)/1000)}:R>!\n\nIf you have any questions, feel free to DM <@289884287765839882>`
						}
					],
					content: invite.url
				}).then(() => {
					console.log(`Successfully sent invite to ${user.displayName}`);
				}).catch((err) => {
					console.log(`[ERROR] Couldnt send invite code "${invite.code}" to ${user.displayName}!!!!!!!!`);
				});
			})
		})
	});
});

client.login(config.discord.token);