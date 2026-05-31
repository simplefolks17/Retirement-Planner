# Transitioning Your Financial Planner to Claude Code

A step-by-step guide assuming no prior coding, terminal, or GitHub experience.

---

## What You'll End Up With

- A **GitHub repository** (cloud storage for your code, with version history)
- **Claude Code** running on your computer, able to read, edit, and run your project
- Your financial planner decomposed from one 3,987-line file into organized modules
- Tests that verify the financial math is correct

---

## Step 1: Check What You Need

### Your Computer
- **macOS**, **Windows 10+**, or **Linux** (Ubuntu 20.04+)
- Internet connection

### Your Anthropic Account
Claude Code requires a **paid Claude subscription** — Pro, Max, Teams, or Enterprise. The free plan does not include Claude Code access. If you're currently on Pro, that works. Max gives higher usage limits if you plan to use Claude Code extensively.

---

## Step 2: Install Git

Git is the version control system that tracks changes to your code. GitHub is the website that stores your code in the cloud. Git is the tool on your computer that talks to GitHub.

### Mac
Open **Terminal** (search "Terminal" in Spotlight, or find it in Applications → Utilities).
Type this and press Enter:
```
git --version
```
If Git is already installed, you'll see a version number. If not, your Mac will prompt you to install the Command Line Developer Tools — click **Install** and wait.

### Windows
Download **Git for Windows** from: https://git-scm.com/download/win

Run the installer. Click **Next** on every screen — the defaults are fine. This also installs **Git Bash**, which Claude Code needs on Windows.

### Verify It Worked
Open a terminal and type:
```
git --version
```
You should see something like `git version 2.xx.x`.

---

## Step 3: Configure Git (One-Time Setup)

In your terminal, type these two commands (use your actual name and email — the same email as your GitHub account):

```
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

---

## Step 4: Install Claude Code

### Mac / Linux
Open Terminal and run:
```
curl -fsSL https://claude.ai/install.sh | bash
```

### Windows
Open **PowerShell** (search "PowerShell" in the Start menu) and run:
```
irm https://claude.ai/install.ps1 | iex
```

### Verify It Worked
Close and reopen your terminal, then type:
```
claude --version
```
You should see a version number.

---

## Step 5: Log Into Claude Code

In your terminal, type:
```
claude
```

A browser window will open asking you to authorize Claude Code with your Anthropic account. Follow the prompts and log in. Once authorized, go back to your terminal — you should see the Claude Code welcome screen.

Type `/exit` to close it for now. We'll come back to it after setting up the project.

---

## Step 6: Create Your GitHub Repository

### On GitHub (in your browser)

1. Go to https://github.com and sign in
2. Click the **+** button (top right) → **New repository**
3. Settings:
   - **Repository name:** `retirement-planner` (or whatever you'd like)
   - **Description:** "Retirement financial planner with tax optimization"
   - **Visibility:** Private (you can make it public later)
   - Check **"Add a README file"**
   - Under **"Add .gitignore"** → select **Node**
4. Click **Create repository**

### Copy the Repository URL

On your new repository page, click the green **Code** button and copy the HTTPS URL. It will look like:
```
https://github.com/YOUR-USERNAME/retirement-planner.git
```

---

## Step 7: Clone the Repository to Your Computer

This downloads the repository to your computer so you can work on it.

### Choose Where to Put It
Pick a folder you'll remember. In your terminal:

**Mac/Linux:**
```
cd ~/Documents
```

**Windows (PowerShell):**
```
cd $HOME\Documents
```

### Clone It
```
git clone https://github.com/YOUR-USERNAME/retirement-planner.git
```
(Replace with your actual URL from Step 6.)

It may ask for your GitHub credentials. If so:
- **Username:** your GitHub username
- **Password:** you'll need a **Personal Access Token** (GitHub no longer accepts passwords)

#### Creating a Personal Access Token (if needed)
1. Go to https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Give it a name like "Claude Code"
4. Check the **repo** checkbox (full repository access)
5. Click **Generate token**
6. **Copy the token immediately** — you won't see it again
7. Use this token as your password when Git asks

### Enter the Project Folder
```
cd retirement-planner
```

---

## Step 8: Add Your Project Files

You have 7 files to add. First create the docs folder, then copy everything in:

**Mac/Linux:**
```
mkdir docs
cp ~/Downloads/financial-scenarios.jsx .
cp ~/Downloads/feature-tracker.html .
cp ~/Downloads/CLAUDE.md .
cp ~/Downloads/README.md .
cp ~/Downloads/ARCHITECTURE.md docs/
cp ~/Downloads/FINANCIAL-MODEL.md docs/
cp ~/Downloads/DESIGN.md docs/
cp ~/Downloads/INTEGRATIONS.md docs/
```

**Windows (PowerShell):**
```
mkdir docs
copy $HOME\Downloads\financial-scenarios.jsx .
copy $HOME\Downloads\feature-tracker.html .
copy $HOME\Downloads\CLAUDE.md .
copy $HOME\Downloads\README.md .
copy $HOME\Downloads\ARCHITECTURE.md docs\
copy $HOME\Downloads\FINANCIAL-MODEL.md docs\
copy $HOME\Downloads\DESIGN.md docs\
copy $HOME\Downloads\INTEGRATIONS.md docs\
```

(Adjust paths if your files are somewhere other than Downloads.)

Your project folder should now look like:
```
retirement-planner/
  CLAUDE.md                  ← Claude Code reads this every message
  README.md                  ← GitHub displays this on your repo page
  feature-tracker.html       ← Feature backlog (28 items)
  financial-scenarios.jsx    ← The monolith to decompose
  docs/
    ARCHITECTURE.md          ← Module map, data flow, testing strategy
    FINANCIAL-MODEL.md       ← Formulas, assumptions, IRS update procedure
    DESIGN.md                ← Color tokens, typography, component inventory
    INTEGRATIONS.md          ← External services (Clerk, Supabase, Stripe), hybrid architecture
```

---

## Step 9: Push Your Files to GitHub

Run these commands one at a time:

```
git add .
git commit -m "Initial commit: financial planner, feature tracker, and project docs"
git push
```

If you refresh your GitHub repository page in the browser, you should see both files.

---

## Step 10: Start Claude Code in Your Project

Make sure you're in the project folder, then:
```
claude
```

You'll see the welcome screen. Now give Claude Code its first task — creating the project scaffold. Paste this prompt:

---

### Your First Prompt for Claude Code

```
I have a retirement financial planner built as a single React JSX file
(financial-scenarios.jsx, ~3,987 lines) with supporting docs.

Start by reading these files in order:
1. CLAUDE.md (project rules — you'll read this automatically)
2. docs/ARCHITECTURE.md (module map and data flow)
3. docs/FINANCIAL-MODEL.md (formulas and assumptions)
4. docs/DESIGN.md (design system)
5. docs/INTEGRATIONS.md (external services and hybrid architecture plan)
6. feature-tracker.html (what's been built, what's planned)
7. financial-scenarios.jsx (the monolith)

Then I need you to:

1. Create a React + Vite project scaffold in this directory
2. Decompose the monolith into the module structure shown in
   docs/ARCHITECTURE.md
3. After each file is created, run the project to make sure it compiles
4. Write tests for the financial model as documented in the
   "Testing Strategy" section of ARCHITECTURE.md
5. Verify all tests pass

Keep the exact same visual design and behavior — this is a refactor,
not a redesign. Every number should match what the monolith produces.

Create a plan before making any changes. Show me the plan and wait
for my approval before starting.
```

---

## Useful Claude Code Commands

Once you're inside Claude Code, here are commands you'll use:

| What you type | What it does |
|---|---|
| `/help` | Shows all available commands |
| `/exit` | Exits Claude Code |
| `/resume` | Continues your last conversation |
| `/clear` | Starts a fresh conversation |
| `/cost` | Shows how much you've used this session |

For everything else, just type in plain English. Claude Code reads your files, runs commands, edits code, and creates new files — all from your descriptions.

---

## Day-to-Day Workflow

Once the project is set up, your daily workflow looks like this:

1. Open terminal, navigate to your project: `cd ~/Documents/retirement-planner`
2. Start Claude Code: `claude`
3. Describe what you want in plain English
4. Review the changes Claude Code proposes (it asks before modifying files)
5. When you're happy with a batch of changes, save to GitHub:

```
git add .
git commit -m "Brief description of what changed"
git push
```

This creates a checkpoint. If anything ever goes wrong, you can always go back to any previous commit.

---

## Quick Reference: Terminal Basics

| Command | What it does |
|---|---|
| `cd folder-name` | Enter a folder |
| `cd ..` | Go up one folder |
| `ls` (Mac/Linux) or `dir` (Windows) | List files in current folder |
| `pwd` (Mac/Linux) or `cd` (Windows, alone) | Show what folder you're in |
| Up arrow key | Repeat your last command |
| `Ctrl + C` | Cancel whatever's running |

---

## CLAUDE.md — Your Project's Brain

Claude Code reads `CLAUDE.md` automatically every time it starts. It contains the critical rules that prevent recurring bugs — things like "use netPortfolioNeed not effectiveExpenses" and "never hardcode IRS limits." It also points to the four docs files for deeper reference.

The supporting docs in `docs/` are only read when Claude Code needs them for a specific task — this saves tokens on routine messages. If you're adding a feature, tell Claude Code to check `docs/ARCHITECTURE.md` for where to wire it. If you're touching financial math, point it to `docs/FINANCIAL-MODEL.md`. If you're wiring auth, database, payments, or the client/server split, point it to `docs/INTEGRATIONS.md`.

You can ask Claude Code to update any of these files:
```
Add to docs/DESIGN.md that we're using shadcn/ui components going forward.
```

---

## What Happens Next

After the decomposition is complete, you'll have:

- A running React app you can open in your browser (`npm run dev`)
- Organized code where each file has one clear purpose
- Tests that catch bugs before they reach users
- A Git history that lets you undo any change
- A foundation where the remaining 10 planned features are each a focused task

The feature tracker's 10 remaining items can then be tackled one at a time, each as a clean prompt to Claude Code rather than surgery on a monolith.
