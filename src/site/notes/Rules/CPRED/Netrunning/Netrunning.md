---
{"dg-publish":true,"permalink":"/rules/cpred/netrunning/netrunning/","dg-note-properties":{}}
---

> This entire section is [[Rules/Homebrew\|Homebrew]], based on [The Mist, a hacking supplement](https://mldibbs.itch.io/the-mist) for [The Sprawl](https://www.drivethrurpg.com/en/product/171286/the-sprawl-midnight).

Also see:
- [[Rules/CPRED/Netrunning/Quickhacks\|Quickhacks]]
- [[Rules/CPRED/Netrunning/Netrunner Gear\|Netrunner Gear]]
- [[Rules/CPRED/Netrunning/ICE\|NET Enemies]]

Netrunning is **a form of hacking**[^1] that requires the user to disconnect themselves from **meatspace** in order to enter an altered state of consciousness allowing them to parse large amounts of data at much faster speeds, quite literally "connecting" their brain to the grid.

Netrunning is **software-oriented**, meaning that whenever an electronic system can be bypassed through Netrunning, the character interfaces with the given system, altering little about its hardware (as opposed to a [[Rules/CPRED/Roles/Techie\|Techie]] hotwiring the same electronic lock).

When trying to netrun, there are two types of systems one can interact with:
- a [[Rules/CPRED/Netrunning/Netrunning#Clear Systems\|Clear System]] requires a cyberdeck, but doesn't require an [[Rules/CPRED/Cyberware/Cyberware#Psychological and Neural\|Operating System]]; these systems operate similarly to other digital spaces, which just require some patience to infiltrate
- [[Rules/CPRED/Netrunning/Netrunning#The Mist\|The Mist]] is a specialized digital system, built to efficiently hide data, make compromising the system tricky and trap rival [[Rules/CPRED/Roles/Netrunner\|Netrunners]]. Upon entering **the Mist**, the player is met with a digital simulation akin to a dream-like trance and must navigate this space to reach their information.
	- **tricky to access**
	- **expansive datasets**
	- **dangerous immersion**
Both systems may have SysAdmins, [[Rules/CPRED/Roles/Netrunner\|rival Netrunners]] tasked with scrubbing the systems for break-ins.

# Netrunner Gear
Before you enter The Mist, you will configure your entry tech to give you certain advantages once inside. To configure your tech, you will divide a certain number of points between all possible attributes to create a Dreamer Config. The tech you have access too may be basic or advanced depending on your circumstances and/or investment.
- **Hardening.** Spend a point of Hardening to prevent an Wisp attack from damaging your Config.
- **Firewall.** Spend a point of Firewall to prevent an Wisp attack from damaging your programs.
- **Stealth.** As long as your Stealth exceeds a Wisp’s Trace they cannot “Identify an Intruder” or “Sever a Connection”.
- **Processor.** The number of programs you can run.

# The Mist
Encourage your players to dig into their character's past and understanding of the world. Help them draw on past experiences by asking lots of questions.

### Entering the Mist
- Do you know this Mist’s digital location, or have a physical access point into the Mist?
- Do you have the necessary credentials to access this Mist?
- Is this a Mist with different levels? What is the level of your credentials?
Before entering The Mist, it is wise to find a **Lighthouse**[^2].

#### JACK IN
*d10+INTERFACE*
- **+2 above DR.** You're in the clean.
- **± 1 DR.** You’re in, but choose one of these options:
	- Passive trace (+1 trace)
	- [[Rules/CPRED/Netrunning/ICE\|ICE]] is activated
	- An alert is triggered (advance the Mission Clock)
	- Your access is restricted: Take -1 ongoing to Mist moves in this system while restricted.
- **less than ±1 DR.** You’re in, but the MC chooses two of the above.

- Trace: 1
### Navigating the Mist
**You can explore and interact with The Mist using the standard moves** and any moves that you would normally use with your playbook, but there are also some special moves that will help you succeed in this unique environment. 
Those who enter The Mist typically do so seeking something in particular: a dataset, a system control, etc. Experienced Mist users will assess difficult systems by comparing and contrasting what is shared and what is dissimilar within The Mist they all see.

#### LOCATE
*d10+INT+Tracking*
- **+2 above DR.** You find what you're looking for.
- **± 1 DR.** You find what you’re looking for, but it’s a messy search. You’ll leave a trace behind. Advance a relevant clock.
- **less than ±1 DR.** You can’t find what you’re looking for and a clock advances.

#### COMPROMISE
*d10+TECH+Electronics/Security Tech*
- **+2 above DR.** Gain 3 hold to use within the system.
- **± 1 DR.** Gain 1 hold to use within the system.
- **less than ±1 DR.** An alert is triggered, which may have additional consequences.

You may spend 1 hold to issue a Command within this System from the list below:
- **Unlock this System.** You must do this before issuing any of the below commands:
	- Access specific data.
	- Save or transfer specific data.
	- Cancel or trigger an Alert.
	- Send a message.
	- Change or alter access permissions.
	- Affect a physical component controlled by this system.

### Leaving the Mist
**If there are no threats around you, and you are not too deep in The Mist, it is easy enough to remember your Lighthouse and find your way out.** In this case you don’t have to roll. 

If however you are in the clutches of a Wisp, are in a more secure layer of The Mist, or The Mist has deepened for you at all it will be a greater struggle to make it out. 

**When you, your programs, or your deck are about to be damaged by a Wisp, you can try to get out of the system by taking a breath and trying to recall your Lighthouse. Remember, it’s only a dream.**

#### JACK OUT
*d10+INTERFACE*
- **+2 above DR.** You disconnect yourself from the system before any serious harm occurs.
- **± 1 DR.** You’re out, but choose one of these options:
	- You lose some of the data you retrieved.
	- The owners of the The Mist trace you to your current location.
	- You take 4d6 damage (ignores armor) in the attempt.
- **less than ±1 DR.** Pick one of the above consequences... and you’re still in.

### Enemies ([[Rules/CPRED/Netrunning/ICE\|ICE]])
[[Rules/CPRED/Netrunning/ICE\|ICE]] (Intrusion Countermeasures Electronics) are security measures that are installed within every Mist to make it even more challenging to manipulate. Different types of [[Rules/CPRED/Netrunning/ICE\|ICE]] can take different actions, and present different levels of risk. They will become more dangerous the deeper you push into a particular Mist, or as clocks tick up and you draw notice.

[[Rules/CPRED/Netrunning/ICE\|ICE]] usually hides within the environment created by the Mist and, once they detect an intruder, they try to slowly drag them down. They try as much as possible to refrain from active face-to-face conflict. However, once the [[Rules/CPRED/Roles/Netrunner\|Netrunner]] identifies it, they can initiate [[Rules/CPRED/Netrunning/Netrunning#WispER\|Whisper]].

#### WHISPER
*d10+INTERFACE*
- **± 1 DR.** You EVADE, DESTROY or temporarily DISABLE a Wisp.
	- EVADE: you’re unnoticed, but you must leave that area immediately.
	- DESTROY: the Wisp is destroyed, but the system knows something has been altered.
	- DISABLE: the Wisp switches off for a moment, but it will resume very soon.
- **± 1 DR.** The Wisp successfully executes a routine[^3] before you can disable it.
- **less than ±1 DR.** The GM makes **a move** as hard as they want.
#### RESIST
*d10+Resist Torture/Drugs+WILL*
When a Wisp attempts to **DEEPEN THE MIST**, you have to resist as to not become **LOST**.
- **+2 above DR.** You remember your Lighthouse and resist this attempt to draw you deeper.
- **± 1 DR.** You are not drawn deeper in but choose one:
	- Take harm as you do your best to break free.
	- Something of value breaks in your struggle.
	- A companion must pull you out. They must now roll to Resist in your place.
- **less than ±1 DR.** You are drawn in deeper. Take -1 to any future resist rolls. If this hits -3, you are Lost in the Mist[^4].

# Clear Systems
There are many systems that might not need the unique benefits that The Mist provides. These systems will operate similar to more traditional digital spaces, accessed through interfacing with a screen or a control panel. 

Unlike The Mist, you do not need to Jack-Out, but you do need to gain Access. Once in the system, you can cut your usage at any time, and do not need to roll. If you have a Cyberdeck you can use your Stealth stat to negate a clock advance. You can do this once for each point you have in Stealth. 

- **Level 1.** Simplistic, only does one task.
	- These systems are simplistic which makes their data easier to navigate. You don’t have to Locate since there are not many available, and instead can move right to Compromising the system.
- **Level 2.** Runs several functions..
	- All the rules are standard. You must Locate before attempting to Compromise the system.
- **Level 3.** More complex or protected systems.
	- Take a -1 on all your rolls in this more protected system. You must Locate before attempting to Compromise the system.



[^1]: For the other form of hacking, see [[Quickhacking\|Quickhacking]].

[^2]: a memory (a person, a place, an object, etc.) that has resonant personal meaning, something that will help you remember why you’re here if you start to drift too far. By following your Lighthouse you can usually find your way back to the waking world.

[^3]: a set of actions. White [[Rules/CPRED/Netrunning/ICE\|ICE]] can only take 1 action, Red [[Rules/CPRED/Netrunning/ICE\|ICE]] can take 2, Black [[Rules/CPRED/Netrunning/ICE\|ICE]] can take 3.

[^4]: If you have been Lost to the Mist, you will no longer be able to wake up, and the owners of The Mist will instantly trace your physical location. You will have to be moved if you don’t want them to cut you off at the source. The only way to escape being Lost is someone else (friends, allies, or hacker mercs) to delve into a version of this Mist that has melded with what trapped you. They can do this by accessing your Cyberdeck or OS directly. From there it’s up to them to find you, defeat what’s keeping you, and pull you out back out again.
