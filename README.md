# Portfolio Dependency Manager - Structured React Application

✅ **COMPLETE AND READY TO RUN!**

A professional, fully-structured React application for managing portfolios, initiatives, and cross-team dependencies.

## 🎉 What's Complete

### ✅ All Configuration Files
- package.json, vite.config.js, tailwind.config.js
- Git ignore, PostCSS configuration

### ✅ All Custom Hooks (Business Logic)
- `useLocalStorage` - Persistent state management
- `usePortfolios` - Portfolio CRUD operations
- `useInitiatives` - Initiative CRUD operations
- `useDependencies` - Dependency CRUD operations

### ✅ All Components
- **Layout:** Header, Navigation, SettingsModal
- **Portfolio:** PortfolioCard
- **Initiative:** InitiativeCard
- **Dependency:** DependencyItem, DependencyMatrix
- **Common:** Icons (all icon components)

### ✅ All Views (Pages)
- PortfoliosView
- DependenciesView (with Outgoing/Incoming tabs)
- PrioritizationView (drag-and-drop)
- AlignmentView (dependency matrix, health)
- PortfolioOverviewView

### ✅ All Utilities
- Reference code generation (PF-0001, IN-0001, DEP-0001)
- Data export/import (JSON)

### ✅ All Constants
- Teams, Quarters, Effort Sizes, Value Types, Statuses

### ✅ Main App
- Complete App.jsx with all routing and state management
- Entry point (index.jsx)
- Global styles with Tailwind CSS

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- npm (comes with Node.js)

### Installation

```bash
# 1. Navigate to the directory
cd portfolio-app

# 2. Install all dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open your browser to http://localhost:5173
```

That's it! The app should now be running.

## 📦 Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## 📁 Project Structure

```
portfolio-app/
├── public/
│   └── index.html                           # HTML shell
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   └── Icons.jsx                    # All icons
│   │   ├── Layout/
│   │   │   ├── Header.jsx                   # Top header
│   │   │   ├── Navigation.jsx               # Tab navigation
│   │   │   └── SettingsModal.jsx            # Export/Import modal
│   │   ├── Portfolio/
│   │   │   └── PortfolioCard.jsx            # Portfolio display/edit
│   │   ├── Initiative/
│   │   │   └── InitiativeCard.jsx           # Initiative display/edit
│   │   └── Dependency/
│   │       ├── DependencyItem.jsx           # Single dependency
│   │       └── DependencyMatrix.jsx         # Matrix view
│   ├── hooks/                               # Custom React hooks
│   │   ├── useLocalStorage.js               # localStorage wrapper
│   │   ├── usePortfolios.js                 # Portfolio logic
│   │   ├── useInitiatives.js                # Initiative logic
│   │   └── useDependencies.js               # Dependency logic
│   ├── utils/                               # Helper functions
│   │   ├── referenceCodeGenerator.js        # Generate ref codes
│   │   └── dataExport.js                    # Export/import logic
│   ├── constants/
│   │   └── index.js                         # App constants
│   ├── views/                               # Main pages
│   │   ├── PortfoliosView.jsx               # Portfolios tab
│   │   ├── DependenciesView.jsx             # Dependencies tab
│   │   ├── PrioritizationView.jsx           # Prioritization tab
│   │   ├── AlignmentView.jsx                # Alignment tab
│   │   └── PortfolioOverviewView.jsx        # Overview tab
│   ├── App.jsx                              # Main app component
│   ├── index.jsx                            # Entry point
│   └── index.css                            # Global styles
├── package.json                             # Dependencies
├── vite.config.js                           # Vite configuration
├── tailwind.config.js                       # Tailwind configuration
└── README.md                                # This file
```

## 🎯 Features

### 1. Portfolio Management
- Create, edit, delete portfolios
- Track owner, year, description
- Unique reference codes (PF-0001, PF-0002, etc.)

### 2. Initiative Tracking
- Create initiatives per team
- Assign to portfolios
- Quarter planning (Q1-Q4)
- Effort estimation (TBD, S, M, L, XL)
- Value tracking (EUR, Regulatory, Risk Reduction)
- Unique reference codes (IN-0001, IN-0002, etc.)

### 3. Dependency Management
- **Outgoing:** What your team needs from others
- **Incoming:** What others need from your team
- Status tracking (Pending, Committed, Under Discussion, Can't Commit)
- Quarter-based planning
- Effort estimation
- Unique reference codes (DEP-0001, DEP-0002, etc.)

### 4. Prioritization
- Drag-and-drop reordering
- Visual dependency status
- Portfolio assignment view

### 5. Alignment Dashboard
- Portfolio health metrics
- Team alignment needs
- Dependency status overview
- Dependency matrix (initiatives vs teams)

### 6. Portfolio Overview
- Consolidated portfolio performance
- Initiative status breakdown
- Value aggregation
- Risk identification

### 7. Data Management
- Export to JSON
- Import from JSON
- Automatic localStorage persistence

## 🛠️ Development

### Hot Reload
Changes are reflected instantly - no page refresh needed!

### Adding Features

**Example: Add a "Priority" dropdown to portfolios**

1. Update the data structure in `usePortfolios.js`:
```javascript
const addPortfolio = () => {
  const newPortfolio = {
    // ... existing fields
    priority: 'High' // Add this
  };
};
```

2. Update the UI in `PortfolioCard.jsx`:
```javascript
<select
  value={portfolio.priority}
  onChange={(e) => onUpdate(portfolio.id, 'priority', e.target.value)}
>
  <option>High</option>
  <option>Medium</option>
  <option>Low</option>
</select>
```

That's it! localStorage persistence is automatic.

### Debugging Tips
- Use React DevTools browser extension
- Check browser console for errors
- Use `console.log()` in your hooks to see state changes
- Inspect localStorage in browser DevTools (Application tab)

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` folder.

### Deploy to GitLab Pages

1. Build the app: `npm run build`
2. Push the `dist/` folder to your repository
3. Configure GitLab Pages to serve from `dist/`

### Deploy to Netlify

1. Connect your repository
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Deploy!

### Deploy to Vercel

Same as Netlify - it auto-detects Vite projects.

## 📚 Learn More

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- **REACT-CONCEPTS-GUIDE.md** - Your comprehensive React guide (in the outputs folder)

## 🔄 Migrating Data from Old Version

If you have data in the old single-file version:

1. Open the old version
2. Click Settings → Export
3. Save the JSON
4. Open this new version
5. Click Settings → Import
6. Select the JSON file

All your data will be transferred!

## 🎨 Customization

### Changing Teams

Edit `src/constants/index.js`:
```javascript
export const TEAMS = [
  'Your Team 1',
  'Your Team 2',
  // ... add more
];
```

### Changing Colors

Edit `tailwind.config.js` to customize the color palette.

### Adding New Views

1. Create a new file in `src/views/`
2. Import it in `App.jsx`
3. Add a button in `Navigation.jsx`
4. Add a condition in `App.jsx` to render it

## 🐛 Troubleshooting

### Port Already in Use
```bash
npm run dev -- --port 3000
```

### Dependencies Not Installing
```bash
rm -rf node_modules package-lock.json
npm install
```

### Changes Not Showing
- Clear browser cache (Ctrl+Shift+R)
- Check console for errors
- Restart dev server (Ctrl+C, then `npm run dev`)

### localStorage Full
- Open DevTools → Application → localStorage
- Clear old data
- Or increase quota in browser settings

## ✨ What's Different from Single-File Version?

| Feature | Single HTML | Structured App |
|---------|------------|----------------|
| **Readability** | ❌ Minified | ✅ Clean, organized |
| **Debugging** | ❌ Hard | ✅ Easy to isolate |
| **Hot Reload** | ❌ Manual | ✅ Automatic |
| **Collaboration** | ❌ Conflicts | ✅ Multiple devs can work |
| **Testing** | ❌ Impossible | ✅ Test each part |
| **Adding Features** | ❌ Risky | ✅ Safe, isolated |
| **Build Optimization** | ❌ None | ✅ Minified, tree-shaken |

## 🎓 Next Steps

### Learn the Codebase
1. Start with `App.jsx` - see how everything connects
2. Look at a custom hook (like `usePortfolios.js`) - this is where logic lives
3. Check out a view (like `PortfoliosView.jsx`) - see how it uses the hook
4. Explore a component (like `PortfolioCard.jsx`) - pure UI

### Add the Quarter Management Feature
Now that you have a proper structure, adding the quarter management feature will be much easier:

1. Create `src/hooks/useQuarters.js`
2. Create `src/components/Quarter/` components
3. Create `src/views/QuarterReviewView.jsx`
4. Update `App.jsx` to include the new view

The structure makes it safe and straightforward!

## 📞 Support

Having issues? Check:
1. This README
2. REACT-CONCEPTS-GUIDE.md (in outputs folder)
3. Browser console for errors
4. React DevTools

## 🎉 You're All Set!

Your Portfolio Dependency Manager is now:
- ✅ Properly structured
- ✅ Professional and maintainable
- ✅ Ready for collaboration
- ✅ Easy to extend with new features
- ✅ Production-ready

Run `npm install` and `npm run dev` to get started!
