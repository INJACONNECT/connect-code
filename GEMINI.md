## Prototyping Strategy & Mindset

- Think very very less, Don't plan, Directly work faster on implementation within seconds strictly.
- Remember to build only 3-4 simple features in one go for prototyping MVP.
- Keep things simple and Clean. Don't do any complex implementations unless absolutely necessary.
- Don't add any complex libraries for animation, simulating backend/ai repospense etc unless asked explicitly by user.

## Development Workflow

- Don't run dev server.
- Use only pnpm.
- Always install dependancies if not installed before checking typescript errors or running build.
- Run pnpm build after completion of task at the end only. Don't run build command in between. Fix any errors and run build again.
- While editing exisitng code do very minimal targeted changes related to any feature or bug requested only. Don't make unnecessary changes
- Don't run any git related commands.
- Don't change anything inside eslint config, vite.config and vite plugin files strictly.

## Tech Stack & Implementation

- Work with only tailwind css v4 whose setup is already done correctly (no verification needed).
- Mock the backend with local storage.
- Always simulate backend with local storage and mock data son't add any workers or external api calls for that.
- If user tells to use attached images as logo or some static image in app copy those attached image files to public directory first and then use them in code.
- Don't delete files from .references directory.

## UI/UX Guidelines

- While making UI consider the user prompt category whether to make Professional UI / Jazzy UI / Playful UI or any other type of UI based on the prompt and considering the use of app and how app will be used by end users.
- Also always take into consideration the atttached files/image paths while building UI design if user mentions 'design from this' or 'attached image' etc.
- Make UI elegant, clean and modern.
- Body should not be scrollable horizontally at all. Ensure proper overflow handling.
- Don't change the default font and styling from index.css unless asked explicitly or unless absolutely required.
- Don't add any type of css reset over '\*' selector keep current styles as it is.
- Don't use tailwind theme from index.css file while writing tailwind classes e.g bg-background,text-forground,bg-primary,text-primary etc. unless custom theme is given by user.
