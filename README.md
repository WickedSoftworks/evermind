# Evermind

Evermind is a modern, responsive web application built to help users seamlessly manage their assignments and tasks. Featuring a comprehensive dashboard, a weekly calendar view, and personalized settings, it is designed for students and professionals to stay organized and productive.

## 🚀 Features

- **Dashboard**: Get a high-level overview of your tasks and productivity statistics.
- **Assignment Management**: Easily add, edit, track, and organize your tasks and assignments.
- **Weekly View**: Visualize your workload across the week to plan ahead effectively.
- **Authentication**: Secure login and user sessions integrated with Supabase.
- **Customizable Experience**: Dark mode, compact mode, and customizable color themes.
- **Responsive Design**: Optimized for both desktop and mobile layouts.

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) (accessible, unstyled components via shadcn/ui) & [Lucide React](https://lucide.dev/) (icons)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **State & Form Management**: React Hook Form, Date-fns, Embla Carousel

## 📂 Project Structure

- `app/` - Next.js App Router pages (Dashboard, Auth, Settings, etc.)
- `components/` - Reusable UI components including assignments lists, dialogs, and layout elements.
  - `components/ui/` - Shadcn UI atomic components.
- `lib/` - Utility functions, types, and Supabase client configuration.
- `styles/` - Global CSS and Tailwind configuration.
- `scripts/` - Database schemas and initial setup scripts.

## 🏁 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and npm installed on your machine. You will also need a [Supabase](https://supabase.com/) project to configure your environment variables.

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd evermind
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📜 Database Setup

Ensure your Supabase project is configured with the right schemas.
You can run the provided SQL scripts from the `scripts/` directory to set up your tables (e.g., `001_create_assignments_table.sql`).
