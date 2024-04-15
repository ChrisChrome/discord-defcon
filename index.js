const config = require("./config");
const fs = require("fs");
const Discord = require("discord.js");
const colors = require("colors");
const path = require("path")

const {
	REST,
	Routes
} = require('discord.js');
const dcClient = new Discord.Client({
	intents: ["Guilds", "GuildMembers"]
});
const rest = new REST({
	version: '10'
}).setToken(config.discord.token);

const client = new Discord.Client({
	intents: [
		"Guilds",
		"GuildInvites",
		"AutoModerationConfiguration",
		"AutoModerationExecution",
		"GuildMembers",
		"GuildModeration"
	]
});

const express = require('express');
const { pathToFileURL } = require("url");
const app = express()

// First time bullshit
if (!fs.existsSync("config.json")) {
	// Copy config.json.default, then process.exit(1) after telling the user to fill it out
	fs.copyFileSync("config.json.default", "config.json");
	console.log(`${colors.red("[ERROR]")} config.json not found. Please fill out config.json and restart the bot.`);
	process.exit(1);
}

if (!fs.existsSync("defcon.txt")) {
	// Just make the file, default to lvl 1
	fs.writeFileSync("defcon.txt", "5");
}

/*
DEFCON Levels:
DEFCON 5 - Low Alert, Normal Operations.
DEFCON 4 - Moderate Alert, Server invites are monitored for suspicious individuals.
DEFCON 3 - Moderate Alert, Server invites are locked.
DEFCON 2 - High Alert, Server invite links are locked, Discord server chats are heavily monitored (i.e. slowmodes, active moderation).
DEFCON 1 - High Alert, Full Lockdown. Break all Discord Invites and lock down the SL Server if necessary.
*/

// get DEFCON level from file
let defcon = fs.readFileSync("defcon.txt", "utf8");

// DEFCON Functions, Set up server the way it needs to per DEFCON level
function updateDefcon(level) {
	// Safety check
	if (defcon > 5 || defcon < 1) {
		defcon = 5;
	}
	// Update the file
	fs.writeFileSync("defcon.txt", level);
	// Update the variable
	defcon = level;
	// Update the bot's status
	// client.user.setPresence({
	// 	activities: [{
	// 		name: `DEFCON ${level}`,
	// 		type: Discord.ActivityType.Custom
	// 	}]
	// })
	// Update the status messages
	updateStatusMessages();
	updateSlowmodes();

	// if defcon 2 or lower, disable invites
	if (level <= 3) {
		actionable_servers.forEach((server) => {
			server.disableInvites(true)
		});
	} else {
		actionable_servers.forEach((server) => {
			server.disableInvites(false)
		});
	}

}

// function updateSlowmodes() {
// 	if (defcon >= 3) {
// 		// Disable slowmodes
// 		slowmode_channels.forEach(async (channel) => {
// 			if (channel.channel.type == Discord.ChannelType.GuildCategory) {
// 				channel.channel.guild.channels.cache.forEach((chan) => {
// 					if (chan.parentId == channel.channel.id) {
// 						chan.setRateLimitPerUser(channel.defaultTime);
// 					}
// 				})
// 			} else {
// 				return channel.channel.setRateLimitPerUser(channel.defaultTime);
// 			}
// 		});
// 	} else if (defcon < 3) {
// 		// Enable slowmodes
// 		slowmode_channels.forEach(async (channel) => {
// 			if (channel.channel.type == Discord.ChannelType.GuildCategory) {
// 				// find all channels that have this category as a parent and set slowmode, gotta wait for the promise to resolve
// 				channel.channel.guild.channels.cache.forEach((chan) => {
// 					if (chan.parentId == channel.channel.id) {
// 						chan.setRateLimitPerUser(channel.time);
// 					}
// 				})

// 			} else {
// 				return channel.channel.setRateLimitPerUser(channel.time);
// 			}
// 		});
// 	}
// }

// Redo slowmodes, this time categories are separate, do those first. Still have to loop thru all channels in the guild and check if it has the category as a parent
function updateSlowmodes() {
	if (defcon >= 3) {
		// Disable slowmodes
		slowmode_categories.forEach(async (category) => {
			category.category.guild.channels.cache.forEach((chan) => {
				if (chan.parentId == category.category.id) {
					chan.setRateLimitPerUser(category.defaultTime);
				}
			})
		});

		slowmode_channels.forEach(async (channel) => {
			return channel.channel.setRateLimitPerUser(channel.defaultTime);
		})
	} else {
		// Enable slowmodes
		slowmode_categories.forEach(async (category) => {
			category.category.guild.channels.cache.forEach((chan) => {
				if (chan.parentId == category.category.id) {
					chan.setRateLimitPerUser(category.time);
				}
			})
		});

		slowmode_channels.forEach(async (channel) => {
			return channel.channel.setRateLimitPerUser(channel.time);
		})
	}
}

function updateStatusMessages() {
	let message = config.DEFCON.levels[defcon].message;
	let color = config.DEFCON.levels[defcon].color;
	// strip # from color and parseInt
	color = parseInt(color.replace("#", ""), 16);
	status_messages.forEach((msg) => {
		msg.edit({
			content: "",
			embeds: [{
				title: "DEFCON Status",
				description: message,
				color: color
			}]
		})
	});
	status_names.forEach((channel) => {
		let chan = client.channels.cache.get(channel);
		if (!chan.type == Discord.ChannelType.GuildVoice) return console.log(`${colors.red("[ERROR]")} Channel ${chan.name} is not a voice channel.`);
		console.log(`${colors.green("[INFO]")} Setting channel name for ${chan.name}.`)
		chan.setName(`[ DEFCON ${defcon} ]`).then(() => {
			console.log(`${colors.green("[INFO]")} Successfully set channel name for ${chan.name}.`);
		})
	});
}


// Setup some global variables
let status_messages = [];
let status_names = [];
let actionable_servers = [];
let slowmode_channels = [];
let slowmode_categories = [];

client.on("ready", async () => {
	console.log(`${colors.magenta("[DEBUG]")} Environment variables: ${JSON.stringify(process.env)}`)
	// Get port for webserver from environment over config file (for running on pterodactyl/other panels)
	var port = process.env.SERVER_PORT || config.port;
	// Start webserver
	if (port) app.listen(port, () => {
		console.log(`${colors.cyan("[INFO]")} Webserver started on port ${port}`)
	})
	console.log(`${colors.cyan("[INFO]")} Logged in as ${client.user.tag}`);
	// Get status messages and actionable servers
	config.discord.status_messages.forEach((msg) => {
		// try to get the channel, then message, then push the msg to status_messages, if the channel or message doesnt exist, just return
		let channel = client.channels.cache.get(msg.channel_id);
		if (!channel) {
			console.log(`${colors.red("[ERROR]")} Channel ${msg.channel} not found. Skipping, please use /msg to send a message to the channel.`);
			return;
		}

		if (msg.change_name) {
			// if name is set, add it to status_names, then skip the rest
			console.log(`${colors.green("[INFO]")} Found channel name change for ${channel.name}.`)
			return status_names.push(msg.channel_id);
		}
		console.log(`${colors.green("[INFO]")} Found status message for ${channel.name}.`)
		// fetch the message id, if it doesnt exist, throw error
		channel.messages.fetch(msg.message_id).then((message) => {
			status_messages.push(message);
		}).catch((err) => {
			console.log(`${colors.red("[ERROR]")} Message ${msg.message} not found in channel ${msg.channel}. Skipping, please use /msg to send a message to the channel.`);
			return;
		});

	})
	config.discord.actionable_servers.forEach((server) => {
		let guild = client.guilds.cache.get(server);
		actionable_servers.push(guild);
	})
	// Get slowmode channels
	config.discord.slowmodes.forEach((channel) => {
		let chan = client.channels.cache.get(channel.channel_id);
		if (!chan) {
			console.log(`${colors.red("[ERROR]")} Slowmode channel ${channel.channel_id} not found.`);
			return;
		}
		slowmode_channels.push({ channel: chan, time: channel.slowmode, defaultTime: channel.defaultSlowmode });
	});
	config.discord.slowmode_categories.forEach((category) => {
		let cat = client.channels.cache.get(category.category_id);
		if (!cat) {
			console.log(`${colors.red("[ERROR]")} Slowmode category ${category.category_id} not found.`);
			return;
		}
		slowmode_categories.push({ category: cat, time: category.slowmode, defaultTime: category.defaultSlowmode });
	});

	//console.log(`Went through all guilds and channels:\nGuilds:\n${actionable_servers.map((server) => server.name).join("\n")}\nChannels:\n${slowmode_channels.map((channel.channel) => channel.name).join("\n")}`);
	updateDefcon(defcon);
	client.invites = [];
	// Update Invites
	client.guilds.cache.forEach(guild => { //on bot start, fetch all guilds and fetch all invites to store
		guild.invites.fetch().then(guildInvites => {
			guildInvites.each(guildInvite => {
				client.invites[guildInvite.code] = guildInvite.uses
			})
		})
	})

	const commands = [
		{
			name: "defcon",
			description: "Set the DEFCON level.",
			default_member_permissions: 0,
			options: [
				{
					name: "level",
					description: "The DEFCON level to set.",
					type: 3,
					required: true,
					choices: [
						{
							name: "DEFCON 5",
							value: "5"
						},
						{
							name: "DEFCON 4",
							value: "4"
						},
						{
							name: "DEFCON 3",
							value: "3"
						},
						{
							name: "DEFCON 2",
							value: "2"
						},
						{
							name: "DEFCON 1",
							value: "1"
						}
					]
				},
				{
					name: "confirm1",
					description: "Confirm the DEFCON level change.",
					type: 5,
					required: true
				},
				{
					name: "confirm2",
					description: "Are you REALLY sure?",
					type: 5,
					required: true
				}
			]
		},
		{
			name: "msg",
			description: "Send a message to a channel.",
			default_member_permissions: 0
		}
	]
	// Do slash command stuff
	await (async () => {
		try {
			console.log(`${colors.cyan("[INFO]")} Registering Commands...`)
			let start = Date.now()
			//Global
			await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
			console.log(`${colors.cyan("[INFO]")} Successfully registered commands. Took ${colors.green((Date.now() - start) / 1000)} seconds.`);
		} catch (error) {
			console.error(error);
		}
	})();
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	let command = interaction.commandName;

	switch (command) {
		case "defcon":
			// Update defcon
			let level = interaction.options.getString("level");
			newLevel = new Number(level);
			// if number not between 1 and 5 send error
			if (newLevel < 1 || newLevel > 5) {
				interaction.reply({ content: "Invalid DEFCON level. Please choose a number between 1 and 5.", ephemeral: true });
				return;
			}
			updateDefcon(level);

			// Send response
			interaction.reply({ content: `Successfully set DEFCON level to ${level}.`, ephemeral: true });
			break;
		case "msg":
			// Send message to channel
			interaction.channel.send("...").then((msg) => {
				interaction.reply(msg.id)
			})
			break;
	}
});

client.on('inviteCreate', (invite) => { //if someone creates an invite while bot is running, update store
	client.invites[invite.code] = invite.uses
	if (defcon > 4) return; // Dont need to send new invite messages if we're not monitoring invites
	const channel = client.channels.cache.get(config.discord.invitelog)
	channel.send({
		embeds: [{
			color: 0x00ffff,
			title: "New Invite",
			fields: [
				{
					name: "Invite",
					// inline check, if expiry is in over 100 years, then it's never, otherwise it's the date
					// ${invite.expiresTimestamp > 95617584000 ? "Never" : `<t:${invite.expiresTimestamp}>`
					value: `Code: ${invite.code}\nMax Uses: ${invite.maxUses}\nExpires ${invite.expiresAt}\nCreated at: ${invite.createdAt}`
				},
				{
					name: "Guild",
					value: `${invite.guild.name}\n\`${invite.guild.id}\``
				},
				{
					name: "Channel",
					value: `${invite.channel.name}\n\`${invite.channel.id}\` <#${invite.channel.id}>`
				},
				{
					name: "Inviter",
					value: `${invite.inviter}\n\`${invite.inviter.id}\``
				}
			]
		}]
	});
});

client.on('guildMemberAdd', async (member) => { // We're just gonna always send invite logs, even if we're not monitoring them
	invites = 0;
	const channel = client.channels.cache.get(config.discord.invitelog)
	let guild = member.guild
	member.guild.invites.fetch().then(async guildInvites => { //get all guild invites
		console.log(`len ${guildInvites.length}`)
		guildInvites.forEach(invite => { //basically a for loop over the invites
			invites++
			console.log(invites)
			if (invite.uses != client.invites[invite.code]) { //if it doesn't match what we stored:
				channel.send({
					embeds: [{
						color: 0x00ff00,
						title: "New Member",
						fields: [
							{
								name: "New Member",
								value: `${member} (${member.user.displayName})\n\`${member.id}\`\nJoined at: <t:${member.joinedTimestamp}>\nAccount Created: <t:${member.user.createdTimestamp}>`
							},
							{
								name: "Invite",
								value: `Inviter: ${(invite.inviter.id == client.user.id) ? "Custom Invite URL (Through Bot)" : `${invite.inviter} (${invite.inviter.displayName})`}\nCode: ${invite.code}\nUses: ${invite.uses}`
							},
							{
								name: "Guild",
								value: `${guild.name}\n\`${guild.id}\``
							},
							{
								name: "User IP",
								value: client.invites[invite.code].ip ? client.invites[invite.code].ip : "N/A"
							}
						]
					}]
				});
				client.invites[invite.code] = invite.uses
			} else if (invites == guildInvites.length -1) {
				// Assume its a custom link lol
				channel.send({
					embeds: [{
						color: 0x00ff00,
						title: "New Member",
						fields: [
							{
								name: "New Member",
								value: `${member} (${member.user.displayName})\n\`${member.id}\`\nJoined at: <t:${member.joinedTimestamp}>\nAccount Created: <t:${member.user.createdTimestamp}>`
							},
							{
								name: "Invite",
								value: `N/A (Used Custom Invite)`
							},
							{
								name: "Guild",
								value: `${guild.name}\n\`${guild.id}\``
							}
						]
					}]
				});
			}
		})
	})

	if (defcon <= 3) {
		// DM user saying Invites are disabled for security reasons, then kick them with the same reason
		member.send("Invites are currently disabled for security reasons. Please contact a staff member for assistance.").then(() => {
			member.kick(`DEFCON ${defcon}`);
			channel.send({
				embeds: [{
					color: 0xff0000,
					title: "Member Kicked",
					description: `${member.user.username} was kicked`
				}]
			});
		});

	}
})

app.set('view engine', 'ejs');
// set views directory
app.set('views', path.join(__dirname, 'html'));

// Start doing express stuff
app.get("/", async (req, res) => {
	// If defcon level is 3 or lower, return 403
	if (defcon <= 3 || req.query.test) return res.status(403).render("lockdown.ejs")

	// Otherwise, make a new invite, single use, and redirect the user to it!
	client.guilds.cache.get(config.discord.invite_guild).invites.create(config.discord.invite_channel, { maxAge: 60, maxUses: 1, unique: true }).then((invite) => {
		client.invites[invite.code].ip = req.headers["X-Forwarded-For"]
		res.redirect(`https://discord.com/invite/${invite.code}`);
	})
});

client.login(config.discord.token)