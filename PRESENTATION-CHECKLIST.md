# Presentation Preparation Checklist
## Get Ready to Blow Minds 🚀

## 📋 One Week Before

### Technical Setup
- [ ] **Test the demo end-to-end** (at least 3 times)
- [ ] **Install all dependencies** (`npm install`)
- [ ] **Configure .env file** with working credentials
- [ ] **Test payment provider switching** (Strike → LND)
- [ ] **Verify LND connection** (if using trustless demo)
- [ ] **Check internet connection** at venue
- [ ] **Have mobile hotspot** as backup

### Presentation Tools
- [ ] **Choose slide tool** (Marp, reveal.js, or Google Slides)
- [ ] **Convert PRESENTATION.md** to your chosen format
- [ ] **Test slides** on presentation computer
- [ ] **Export PDF backup** in case of issues
- [ ] **Test video output** (HDMI, USB-C, etc.)
- [ ] **Have adapters** for your laptop

### Demo Environment
- [ ] **Clean terminal windows** (close everything else)
- [ ] **Arrange terminal layout** (operator + commands side-by-side)
- [ ] **Increase font size** (min 18pt for readability)
- [ ] **Test screen sharing** if remote
- [ ] **Close notifications** (Do Not Disturb mode)
- [ ] **Clear browser history/tabs** (looks professional)

---

## 📋 Night Before

### Files to Have Open
- [ ] `PRESENTATION.md` (slides)
- [ ] `DEMO-SCRIPT.md` (demo walkthrough)
- [ ] `payment-providers/lnd.js` (to show trustless code)
- [ ] `middleware/nip98-auth.js` (to show auth)
- [ ] Terminal windows pre-arranged

### Pre-configure
```bash
# Terminal Window 1: Operator
cd ~/donkeyride

# Terminal Window 2: Demo commands
# (Have commands ready to paste)

# Terminal Window 3: Nostr event viewer (optional)
# Open browser to relay viewer
```

### Test Run
- [ ] **Run full demo** (time it - should be 5 min)
- [ ] **Practice transitions** between slides and demo
- [ ] **Practice explanations** of technical concepts
- [ ] **Check pacing** (don't rush!)
- [ ] **Record yourself** (watch for nervous habits)

---

## 📋 Day of Presentation

### 2 Hours Before
- [ ] **Arrive early** to test equipment
- [ ] **Test projector connection**
- [ ] **Test audio** (if using mic)
- [ ] **Test internet** (speed test)
- [ ] **Boot up operator** (make sure it works)
- [ ] **Clear terminal history**
- [ ] **Charge laptop** (and have charger!)

### 30 Minutes Before
- [ ] **Close all apps** except presentation tools
- [ ] **Disable notifications**
- [ ] **Turn off Slack, email, messages**
- [ ] **Set phone to airplane mode**
- [ ] **Have water** nearby
- [ ] **Deep breath!** You've got this.

### Just Before Starting
- [ ] **Open PRESENTATION.md** in slide mode
- [ ] **Have DEMO-SCRIPT.md** visible on laptop screen
- [ ] **Terminal ready** with correct working directory
- [ ] **Browser tabs closed** (or only relevant ones)
- [ ] **Smile!** 😊

---

## 🎤 During Presentation

### Slides 1-10 (First 8 minutes)
**Pace:** Moderate, building energy

**Key Moments:**
- Slide 2: Pause after "£32,896 lost per year"
- Slide 3: Let the table sink in
- Slide 7: Smile when explaining "Operator can't steal!"

**Tips:**
- Make eye contact
- Don't read slides word-for-word
- Tell the story, don't recite facts
- Pause between slides

### Slides 11-17 (Technical Deep Dive - 5 minutes)
**Pace:** Slower for technical content

**Key Moments:**
- Slide 11: Show table, let people absorb it
- Slide 14: Explain hodl invoices clearly
- Slide 17: Build suspense for demo

**Tips:**
- Explain acronyms (LND, CLN, NIP-98)
- Use analogies for non-technical audience
- Check if people are following

### Demo (5 minutes) ⚡
**Critical Success Factors:**
1. **Don't rush** - Slow down for code
2. **Point at screen** when showing output
3. **Explain as you type** - narrate your actions
4. **Pause after each step** - let it sink in
5. **If error occurs** - stay calm, explain why

**Follow DEMO-SCRIPT.md exactly**

### Slides 18-25 (Impact - 5 minutes)
**Pace:** Build to crescendo

**Key Moments:**
- Slide 20: The economics - emphasize £32k savings
- Slide 22: Network effects - paint the vision
- Slide 25: The future - be inspirational

**Tips:**
- Energy should be building
- Use hand gestures
- Show passion for the vision

### Slides 26-35 (Wrap Up - 3 minutes)
**Pace:** Confident, call to action

**Key Moments:**
- Slide 30: Technical roadmap - we're serious
- Slide 32: Call to action - be direct
- Slide 35: Thank you - smile!

**Tips:**
- End strong
- Invite questions
- Be available after

---

## 🐛 Troubleshooting During Demo

### If npm start fails:
> "Perfect timing! This actually shows the resilience we built in. Let me show you the fallback system..."
- Quickly check error
- If simple fix (port in use), kill process
- If complex, skip to next section

### If Internet dies:
> "Ironically, this proves the point. Centralized systems fail. But DonkeyRide runs locally..."
- Show offline functionality
- Explain event queueing
- Move to economic slides

### If code doesn't display right:
> "The code is in the repo, but let me show you the architecture..."
- Draw on whiteboard/paper
- Explain concepts verbally
- Reference slides

### If you forget something:
- Pause
- Look at DEMO-SCRIPT.md (you have it open!)
- Say "Let me make sure I'm showing you the important part..."
- No one knows what you planned to say

---

## 💬 Handling Q&A

### Common Questions & Answers

**Q: "How is this different from Uber?"**
A: "Uber is a company that takes 30%. DonkeyRide is a protocol that takes 0-1%. Like email vs postal service."

**Q: "What about safety/insurance?"**
A: "Same as Uber. Drivers need licenses and commercial insurance. The protocol is just for coordination and payment."

**Q: "How do you prevent fraud?"**
A: "Six layers: reputation, operator bonds, insurance, progressive limits, multi-sig, and trustless staking. I showed you the trustless layer - operator literally can't steal."

**Q: "What about regulation?"**
A: "Drivers still need proper licenses. The protocol is transport-agnostic. We're not circumventing regulation, we're democratizing the technology."

**Q: "How do you make money?"**
A: "I don't. It's a protocol. Like HTTP. Anyone can run an operator and charge fees. Competition drives fees to near-zero."

**Q: "Can Uber just copy this?"**
A: "Their $200B valuation is based on the 30% take. If they adopt this, their stock crashes. Classic innovator's dilemma."

**Q: "What's stopping someone from stealing this idea?"**
A: "Please do! It's MIT licensed. Fork it, improve it, run it. The more operators, the stronger the network."

**Q: "When will this be ready?"**
A: "It's ready now. Production code. You can clone the repo and start earning fees today."

### Difficult Questions

**If you don't know the answer:**
> "Great question. I haven't implemented that yet, but here's how I'm thinking about it..."
- Be honest
- Show your thought process
- Invite collaboration: "If you have ideas, let's talk after!"

**If question is off-topic:**
> "Interesting point, but let's stay focused on the core innovation. Happy to discuss after!"

**If someone is skeptical/negative:**
> "I appreciate the skepticism. Let me show you the code..."
- Stay calm
- Show evidence
- Don't get defensive
- Acknowledge valid concerns

---

## 📸 After Presentation

### Immediate (5 mins)
- [ ] Thank the audience
- [ ] Invite people to try it
- [ ] Share GitHub link
- [ ] Be available for 1-on-1 questions

### That Day
- [ ] Email slides to organizers
- [ ] Post demo video (if recorded)
- [ ] Share on Twitter/Nostr with #donkeyride
- [ ] Follow up with interested people

### That Week
- [ ] Write blog post about the talk
- [ ] Respond to GitHub issues/questions
- [ ] Iterate based on feedback
- [ ] Plan next presentation!

---

## 🎯 Success Metrics

### You Crushed It If:
- ✅ Demo worked without major issues
- ✅ Audience asked follow-up questions
- ✅ Someone cloned the repo
- ✅ Someone wants to run an operator
- ✅ You got invited to present again
- ✅ People came up afterward to talk
- ✅ You felt confident and passionate

### You Did Great Even If:
- Demo had minor hiccups (you recovered!)
- You stumbled on a few words
- You forgot a point (you covered the key stuff)
- You went over time by a few minutes
- Not everyone "got it" (that's normal!)

**Remember:** The goal is to inspire, educate, and recruit.
You're not selling a product, you're sharing a vision.

---

## 🚀 Final Pep Talk

You're presenting something genuinely revolutionary:
- A working alternative to a $200B monopoly
- Built in a weekend
- That gives 98% more income to workers
- Using trustless cryptography
- That literally cannot be shut down

**This is powerful stuff.**

**You're not just giving a talk.**
**You're planting seeds for a better future.**

**Confidence comes from knowing your material.**
**And you know this inside and out.**

### Before You Start

1. Take 3 deep breaths
2. Remember why this matters
3. Picture the driver keeping £32k more per year
4. Smile
5. Let's change the world

**You've got this! 🚀**

---

## 📚 Resources to Have Handy

- GitHub: `github.com/donkeyride/donkeyride`
- Slides: `PRESENTATION.md`
- Demo: `DEMO-SCRIPT.md`
- Quick Start: `QUICK-START.md`
- Your contact: Nostr npub / Twitter / Email

Print these out or have them bookmarked!

---

**Good luck! You're going to kill it! 💪**
