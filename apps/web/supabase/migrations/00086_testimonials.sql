-- Create testimonials table
CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT,
  quote TEXT NOT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  approved BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'website' CHECK (source IN ('website', 'in_app', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for homepage queries (approved + featured)
CREATE INDEX idx_testimonials_approved_featured ON public.testimonials (approved, featured);

-- Enable RLS
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public submissions)
CREATE POLICY "Anyone can submit a testimonial"
  ON public.testimonials
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Authenticated users can read their own submissions
CREATE POLICY "Users can read own testimonials"
  ON public.testimonials
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Anyone can read approved testimonials (homepage display)
CREATE POLICY "Anyone can read approved testimonials"
  ON public.testimonials
  FOR SELECT
  TO anon, authenticated
  USING (approved = true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_testimonials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_testimonials_updated_at();
