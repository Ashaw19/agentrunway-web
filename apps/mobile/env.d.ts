declare module "*.png" {
  const value: number;
  export default value;
}

// Expo injects EXPO_PUBLIC_* env vars via babel transform at build time
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
    EXPO_PUBLIC_API_URL?: string;
    [key: string]: string | undefined;
  };
};
