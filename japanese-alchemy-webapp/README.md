# Japanese Alchemy Web Application

A modern Japanese vocabulary and grammar study application built with Next.js 16, shadcn/ui, and Google Firebase. The application provides a user-friendly interface for managing personal Japanese language study materials with secure authentication and cloud-based data storage.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat&logo=typescript)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-18181b?style=flat)
![Firebase](https://img.shields.io/badge/Firebase-v11-orange?style=flat&logo=firebase)

## 📋 Table of Contents

- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Local Development](#-local-development)
- [Firebase Deployment](#-firebase-deployment)
- [Firestore Security Rules](#-firestore-security-rules)
- [Environment Variables](#-environment-variables)
- [Usage](#-usage)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- **User Authentication**: Sign up and sign in with email/password or Google OAuth
- **Vocabulary Management**: Add, view, and delete Japanese vocabulary words with detailed explanations
- **Grammar Management**: Organize and manage Japanese grammar points with explanations
- **Responsive Design**: Mobile-friendly interface built with shadcn/ui components
- **Real-time Data**: Cloud-based storage with Firestore
- **Secure Access**: User-specific data isolation with Firebase Authentication
- **Dark Mode Support**: Built-in dark mode for comfortable studying
- **Type-Safe**: Full TypeScript implementation for reliable code

## 🛠 Technology Stack

### Frontend
- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **TypeScript 5**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality React component library
- **Radix UI**: Headless UI primitives

### Backend & Services
- **Firebase Authentication**: User authentication and authorization
- **Cloud Firestore**: NoSQL database for data storage
- **Firebase Hosting**: Static web hosting

### Development Tools
- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **Autoprefixer**: CSS vendor prefixing

## 🏗 Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Browser                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Next.js Application (React)                │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │         shadcn/ui Components                   │  │  │
│  │  │  - Auth Forms  - Dashboard  - Cards  - Tabs    │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │         Application Logic                       │  │  │
│  │  │  - AuthContext (Authentication State)          │  │  │
│  │  │  - FirestoreService (Data Operations)          │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Services                          │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  Authentication  │  │      Cloud Firestore            │  │
│  │                  │  │                                 │  │
│  │  - Email/Pass    │  │  users/{userId}                 │  │
│  │  - Google OAuth  │  │    /vocabularies/{docId}       │  │
│  │  - Session Mgmt  │  │    /grammars/{docId}           │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Authentication Flow**:
   - User enters credentials → AuthContext → Firebase Auth
   - Auth state changes → AuthContext updates → UI re-renders
   - Protected routes check auth state → Redirect if unauthenticated

2. **Data Operations Flow**:
   - User action (add/delete) → Component → FirestoreService
   - FirestoreService → Firebase SDK → Cloud Firestore
   - Response → FirestoreService → Component → UI update

3. **User Data Isolation**:
   - All queries include `where('userId', '==', user.uid)`
   - Firestore security rules enforce user ownership
   - Users can only access their own data

## 📁 Project Structure

```
japanese-alchemy-webapp/
├── app/                          # Next.js App Router
│   ├── auth/
│   │   └── page.tsx             # Authentication page (login/signup)
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout with AuthProvider
│   └── page.tsx                 # Main dashboard page
├── components/
│   └── ui/                      # shadcn/ui components
│       ├── alert.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
├── contexts/
│   └── AuthContext.tsx          # Authentication context and hooks
├── lib/
│   ├── firebase.ts              # Firebase configuration and initialization
│   └── utils.ts                 # Utility functions (cn, clsx)
├── services/
│   └── firestoreService.ts      # Firestore data operations
├── types/
│   └── index.ts                 # TypeScript type definitions
├── .env.local.example           # Environment variables template
├── components.json              # shadcn/ui configuration
├── next.config.ts               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── tailwind.config.ts           # Tailwind CSS configuration
└── tsconfig.json                # TypeScript configuration
```

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or higher ([Download](https://nodejs.org/))
- **npm**: Comes with Node.js
- **Git**: For version control ([Download](https://git-scm.com/))
- **Firebase Account**: [Create Firebase Account](https://firebase.google.com/)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd japanese-alchemy-webapp
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js and React
- Firebase SDK
- shadcn/ui components
- TypeScript and ESLint

### 3. Set Up Firebase Project

#### Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "japanese-alchemy")
4. Follow the setup wizard

#### Enable Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Enable **Google** provider
4. Save changes

#### Create Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Choose production or test mode (test mode for development)
3. Select a location (closest to your users)
4. Click **Create**

#### Get Firebase Configuration

1. Go to **Project Settings** → **General** → **Your apps** → **Web app**
2. Copy the configuration values

## ⚙️ Configuration

### 1. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and replace the values with your Firebase configuration:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 2. Configure Firestore Security Rules

In Firebase Console, go to **Firestore Database** → **Rules** and add:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to users' own data
    match /users/{userId}/{collection}/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 💻 Local Development

### Start Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

### Using Firebase Emulators (Optional)

For local development without affecting production data:

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Install emulators:
   ```bash
   firebase emulators:start
   ```

3. The application automatically connects to emulators in development mode

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview the generated Firebase Hosting site locally
npm run preview

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## 🚀 Firebase Deployment

The webapp is deployed as a static Next.js export. Firebase Authentication,
Firestore, and the existing Cloud Functions remain in the `japanese-alchemy`
Firebase project; Firebase Hosting only serves the generated site.

1. Install and authenticate the Firebase CLI (if needed):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. Create the production environment file. The Firebase web configuration is
   safe to expose in the browser; access is protected by Firebase Auth and
   Firestore security rules.
   ```bash
   cp .env.local.example .env.local
   ```

3. Build and deploy from this directory:
   ```bash
   npm run deploy
   ```

The configuration in `firebase.json` deploys the generated `out/` directory to
the `japanese-alchemy-webapp` Hosting site. If you later add server-side
rendering, API routes, or server-only secrets, move this webapp to Firebase App
Hosting or Cloud Run instead of static Hosting.

For a different Firebase project, create a Hosting site first and replace the
`site` value in `firebase.json` with its site ID.

## 🔒 Firestore Security Rules

### Production Rules

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to users' own data
    match /users/{userId}/{collection}/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Test Mode Rules (Development Only)

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **Warning**: Never use test mode rules in production!

## 🌍 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key | Yes | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | Yes | `project-id.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Yes | `japanese-alchemy` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | Yes | `project-id.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging sender ID | Yes | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID | Yes | `1:123456789:web:abc123` |

## 📖 Usage

### First Time Setup

1. **Sign Up**: Navigate to `/auth`, enter email and password
2. **Or Sign In with Google**: Click the Google sign-in button
3. **Access Dashboard**: After authentication, you'll be redirected to the dashboard

### Adding Vocabulary

1. Click "Add Vocabulary" button
2. Enter the Japanese term (e.g., 日本語)
3. Enter the detail/explanation (e.g., Japanese language)
4. Click "Add"

### Adding Grammar

1. Switch to "Grammars" tab
2. Click "Add Grammar" button
3. Enter the grammar point (e.g., 〜てみる)
4. Enter the explanation (e.g., To try doing something)
5. Click "Add"

### Deleting Items

- Click the "Delete" button on any vocabulary or grammar card to remove it

### Sign Out

- Click "Sign Out" in the header to log out

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write meaningful commit messages
- Ensure TypeScript types are correct
- Test your changes thoroughly
- Update documentation as needed

## 📝 License

This project is licensed under the MIT License.

## 🔗 Related Projects

- [Japanese Alchemy Chrome Extension](../japanese-alchemy-chrome-extension/) - Browser extension for Japanese text analysis
- [Japanese Alchemy Firebase Functions](../japanese-alchemy-hosting/) - Backend API for text analysis

## 📞 Support

For support, email support@example.com or open an issue in the repository.

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for the beautiful component library
- [Firebase](https://firebase.google.com/) for the backend services
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for the styling utility

---

Built with ❤️ for Japanese language learners
