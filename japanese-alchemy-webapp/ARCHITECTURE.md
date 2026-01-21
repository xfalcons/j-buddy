# Japanese Alchemy Web App - Architecture Documentation

## Overview

Japanese Alchemy Web App is a single-page application (SPA) built with Next.js 16, React 19, TypeScript, and shadcn/ui components. It leverages Google Firebase for authentication and cloud-based data storage (Cloud Firestore).

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Next.js App Router                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │   /auth     │  │    /       │  │  Protected  │          │  │
│  │  │   (Login)   │  │ (Dashboard)│  │   Routes    │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    React Components                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │shadcn/ui    │  │  Custom     │  │   Context   │          │  │
│  │  │ Components  │  │ Components  │  │ Providers   │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Application Logic                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │ AuthContext │  │Firestore    │  │   Type      │          │  │
│  │  │   (Auth)    │  │ Service     │  │ Definitions │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ↓ HTTPS/WebSocket
┌─────────────────────────────────────────────────────────────────────┐
│                      FIREBASE SERVICES                               │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐     │
│  │  Authentication  │  │        Cloud Firestore              │     │
│  │                  │  │                                     │     │
│  │  • Email/Pass    │  │  Collection: vocabularies            │     │
│  │  • Google OAuth  │  │  Collection: grammars               │     │
│  │  • Session Mgmt  │  │  Indexed by: userId                 │     │
│  └──────────────────┘  └─────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Authentication Layer

**Location**: `contexts/AuthContext.tsx`

**Responsibilities**:
- Manage authentication state (loading, user, authenticated)
- Provide authentication methods (signUp, signIn, signOut, signInWithGoogle)
- Wrap the entire application to provide auth context
- Handle Firebase Auth state changes

**Key Exports**:
- `AuthProvider`: Context provider component
- `useAuth()`: Custom hook for accessing auth context

**Data Flow**:
```
User Action → AuthContext Method → Firebase Auth SDK → Auth State Update → UI Re-render
```

### 2. Data Service Layer

**Location**: `services/firestoreService.ts`

**Responsibilities**:
- Abstract Firestore operations
- Handle data transformation (timestamps to Dates)
- Provide type-safe methods for CRUD operations
- Manage query construction with user-specific filtering

**Key Methods**:

**Vocabulary Operations**:
```typescript
addVocabulary(userId, term, detail) → Promise<string>
getUserVocabularies(userId) → Promise<Vocabulary[]>
deleteVocabulary(id) → Promise<void>
```

**Grammar Operations**:
```typescript
addGrammar(userId, point, explanation) → Promise<string>
getUserGrammars(userId) → Promise<Grammar[]>
deleteGrammar(id) → Promise<void>
```

### 3. Firebase Configuration

**Location**: `lib/firebase.ts`

**Responsibilities**:
- Initialize Firebase app
- Configure Firebase services (Auth, Firestore, Functions)
- Connect to emulators in development
- Export initialized services

**Configuration**:
- Reads from environment variables
- Auto-connects to Firebase emulators in development
- Singleton pattern to prevent multiple Firebase instances

### 4. UI Components

**Location**: `app/page.tsx`, `app/auth/page.tsx`, `components/ui/`

**Responsibilities**:
- Render user interface
- Handle user interactions
- Display data from services
- Manage form state and validation

**Key Components**:

**Dashboard (`app/page.tsx`)**:
- Tabs for switching between vocabularies and grammars
- Card-based layout for displaying items
- Dialog modals for adding new items
- Real-time data loading on mount

**Authentication (`app/auth/page.tsx`)**:
- Sign up/Sign in toggle
- Email/password authentication form
- Google OAuth button
- Error handling and display

## Data Model

### Vocabulary Entity

```typescript
interface Vocabulary {
  id: string;              // Firestore document ID
  userId: string;          // Firebase Auth UID (user ownership)
  term: string;            // Japanese term (e.g., "日本語")
  detail: string;          // Explanation/definition
  createdAt: Date;         // Creation timestamp
}
```

**Firestore Collection**: `vocabularies`

**Index Requirements**:
```json
{
  "indexes": [
    {
      "collectionGroup": "vocabularies",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "userId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    }
  ]
}
```

### Grammar Entity

```typescript
interface Grammar {
  id: string;              // Firestore document ID
  userId: string;          // Firebase Auth UID (user ownership)
  point: string;           // Grammar point (e.g., "〜てみる")
  explanation: string;     // Grammar explanation
  createdAt: Date;         // Creation timestamp
}
```

**Firestore Collection**: `grammars`

**Index Requirements**: Same as vocabularies

## State Management

### Authentication State

**Managed by**: `AuthContext`

**State Structure**:
```typescript
{
  user: User | null,        // Current authenticated user
  loading: boolean,         // Auth state loading status
  signUp: (email, password) => Promise<void>,
  signIn: (email, password) => Promise<void>,
  signInWithGoogle: () => Promise<void>,
  signOut: () => Promise<void>
}
```

### Application State

**Managed by**: React hooks in components

**Dashboard State**:
```typescript
{
  vocabularies: Vocabulary[],      // User's vocabularies
  grammars: Grammar[],            // User's grammars
  activeTab: string,              // Current tab ('vocabularies' | 'grammars')
  
  // Vocabulary Form State
  vocabTerm: string,
  vocabDetail: string,
  isVocabDialogOpen: boolean,
  vocabError: string,
  
  // Grammar Form State
  grammarPoint: string,
  grammarExplanation: string,
  isGrammarDialogOpen: boolean,
  grammarError: string
}
```

## Security Architecture

### Client-Side Security

1. **Authentication Checks**:
   - Protected routes redirect unauthenticated users to `/auth`
   - User context checked before data operations
   - User ID injected into all data operations

2. **Environment Variables**:
   - Firebase configuration in `.env.local`
   - Never committed to version control
   - Prefixed with `NEXT_PUBLIC_` for client access

### Server-Side Security (Firestore Rules)

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-specific data isolation
    match /users/{userId}/{collection}/{documentId} {
      // Only allow authenticated users
      // Only allow access to their own data
      allow read, write: if 
        request.auth != null && 
        request.auth.uid == userId;
    }
  }
}
```

**Security Layers**:
1. Firebase Authentication (identity verification)
2. Firestore Security Rules (data access control)
3. Client-side user ID filtering (defense in depth)

## Routing Architecture

### Route Structure

```
/                           → Dashboard (protected)
/auth                       → Authentication page
  ├── Sign In mode
  └── Sign Up mode
```

### Navigation Flow

```
Unauthenticated User
    ↓
/auth (Login/Signup)
    ↓
Authenticate
    ↓
/ (Dashboard)
    ↓
Manage Vocabularies/Grammars
```

### Protected Routes

**Implementation**: Route-level authentication check in `app/page.tsx`

```typescript
useEffect(() => {
  if (!loading && !user) {
    router.push('/auth');
  }
}, [user, loading, router]);
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**:
   - Next.js automatic code splitting
   - Route-based lazy loading
   - Component-level lazy loading (potential future enhancement)

2. **Data Fetching**:
   - Parallel fetching of vocabularies and grammars
   - Indexed queries for faster retrieval
   - Client-side caching (Firestore SDK)

3. **UI Rendering**:
   - shadcn/ui components use Radix UI primitives
   - Optimized re-renders with proper React patterns
   - CSS-in-JS with Tailwind (no runtime overhead)

### Bundle Size

**Estimated Dependencies**:
- Next.js: ~80 KB
- React: ~40 KB
- Firebase SDK: ~30 KB
- shadcn/ui components: ~15 KB (tree-shakeable)

**Total Initial Bundle**: ~165 KB (gzipped)

## Scalability Considerations

### Database Scaling

- **Firestore**: Automatically scales with user base
- **Queries**: Indexed on userId for efficient user-specific data retrieval
- **Paging**: Implement pagination for large datasets (future enhancement)

### Authentication Scaling

- **Firebase Auth**: Handles millions of users
- **Session Management**: Firebase Auth handles token refresh
- **Social Login**: Google OAuth scales with Google's infrastructure

### Frontend Scaling

- **Static Assets**: Hosted on CDN (Firebase Hosting or Vercel)
- **API Calls**: Direct to Firebase (no backend bottleneck)
- **Edge Deployment**: Can deploy to Edge (future enhancement)

## Future Enhancements

### Planned Features

1. **Real-time Updates**:
   - Use Firestore onSnapshot for live data sync
   - Real-time collaboration features

2. **Advanced Search**:
   - Full-text search with Algolia or Firestore search
   - Filter by JLPT level, category, etc.

3. **Import/Export**:
   - CSV export of vocabularies and grammars
   - Import from Anki or other study apps

4. **Study Modes**:
   - Flashcard mode
   - Quiz mode
   - Spaced repetition system

5. **Offline Support**:
   - PWA capabilities
   - Local storage with Firestore persistence

### Technical Improvements

1. **Type Safety**:
   - Stricter TypeScript configuration
   - Zod for runtime validation
   - API response type definitions

2. **Testing**:
   - Unit tests for services
   - Component tests with React Testing Library
   - E2E tests with Playwright

3. **Monitoring**:
   - Error tracking with Sentry
   - Analytics with Firebase Analytics
   - Performance monitoring

## Development Workflow

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with Firebase config

# 3. Start development server
npm run dev

# 4. Access application
open http://localhost:3000
```

### Firebase Emulators (Optional)

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Start emulators
firebase emulators:start

# 3. Access emulator UI
open http://localhost:4000
```

### Production Deployment

```bash
# 1. Build for production
npm run build

# 2. Deploy to Firebase Hosting
firebase deploy

# OR deploy to Vercel (recommended)
# Connect repository to Vercel
```

## Troubleshooting

### Common Issues

1. **Firebase Connection Error**:
   - Check environment variables
   - Verify Firebase project configuration
   - Ensure Firestore database is created

2. **Authentication Issues**:
   - Verify Authentication providers are enabled
   - Check Firebase Console for auth logs
   - Clear browser localStorage

3. **Data Not Loading**:
   - Check Firestore rules
   - Verify user is authenticated
   - Check browser console for errors

### Debug Mode

Enable debug mode for Firebase:

```typescript
// In lib/firebase.ts
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// For development
if (process.env.NODE_ENV === 'development') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

## Dependencies

### Core Dependencies

```json
{
  "next": "16.1.3",
  "react": "19.0.0",
  "react-dom": "19.0.0",
  "firebase": "^11.0.0",
  "typescript": "^5.0.0"
}
```

### UI Dependencies

```json
{
  "@radix-ui/react-alert-dialog": "^1.0.5",
  "@radix-ui/react-dialog": "^1.0.5",
  "@radix-ui/react-tabs": "^1.0.4",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0",
  "tailwind-merge": "^2.0.0",
  "tailwindcss-animate": "^1.0.7"
}
```

## License

MIT License - See project root for details.
