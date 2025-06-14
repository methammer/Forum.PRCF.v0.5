import { useState, useEffect } from 'react';
    import { supabase } from '@/lib/supabaseClient';
    import { useNavigate, Link, useLocation } from 'react-router-dom';
    import { Button } from "@/components/ui/button";
    import {
      Card,
      CardContent,
      CardDescription,
      CardFooter,
      CardHeader,
      CardTitle,
    } from "@/components/ui/card";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { AlertCircle, LogIn, Info } from 'lucide-react';

    const LoginPage = () => {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [infoMessage, setInfoMessage] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const navigate = useNavigate();
      const location = useLocation();

      useEffect(() => {
        // Check for messages passed via route state (e.g., from ProtectedRoute)
        if (location.state?.message) {
          setInfoMessage(location.state.message);
          // Clear the state to prevent message from re-appearing on refresh
          navigate(location.pathname, { replace: true, state: {} });
        }
      }, [location, navigate]);

      const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfoMessage(null);

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setLoading(false);
          setError(signInError.message || "Email ou mot de passe incorrect.");
          return;
        }

        if (signInData.user) {
          // User authenticated with Supabase, now check profile status
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', signInData.user.id)
            .single();

          if (profileError || !profile) {
            setLoading(false);
            setError("Impossible de récupérer les informations du profil. Veuillez réessayer.");
            await supabase.auth.signOut(); // Sign out if profile can't be fetched
            return;
          }

          if (profile.status === 'approved') {
            setLoading(false);
            navigate('/'); // Redirect to home page on successful login and approval
          } else if (profile.status === 'pending_approval') {
            setLoading(false);
            setError("Votre compte est en attente d'approbation par un administrateur.");
            await supabase.auth.signOut(); // Sign out user, they can't proceed
          } else if (profile.status === 'rejected') {
            setLoading(false);
            setError("L'accès à votre compte a été refusé. Veuillez contacter un administrateur.");
            await supabase.auth.signOut(); // Sign out user
          } else {
            setLoading(false);
            setError("Statut de compte inconnu. Veuillez contacter un administrateur.");
            await supabase.auth.signOut(); // Sign out user
          }
        } else {
          setLoading(false);
          setError("Un problème est survenu lors de la connexion.");
        }
      };

      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
          <Card className="w-full max-w-md shadow-2xl bg-slate-800/50 backdrop-blur-lg border-slate-700">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-blue-600/20 rounded-full w-fit">
                <LogIn className="h-10 w-10 text-blue-400" />
              </div>
              <CardTitle className="text-3xl font-bold text-slate-100">Connexion au Forum Privé</CardTitle>
              <CardDescription className="text-slate-400">
                Accédez à l'espace de discussion du PRCF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {infoMessage && (
                <div className="mb-4 flex items-center p-3 text-sm text-blue-300 bg-blue-900/40 rounded-md border border-blue-700">
                  <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                  <span>{infoMessage}</span>
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votreadresse@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {error && (
                  <div className="flex items-center p-3 text-sm text-red-400 bg-red-900/30 rounded-md border border-red-700">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base" disabled={loading}>
                  {loading ? 'Connexion en cours...' : 'Se connecter'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col items-center space-y-4 pt-6">
              <p className="text-sm text-slate-400">
                Pas encore de compte ?{' '}
                <Link to="/inscription" className="text-blue-400 hover:text-blue-300 hover:underline">
                  S'inscrire ici
                </Link>
              </p>
              <a href="#" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
                Mot de passe oublié ?
              </a>
               <p className="text-xs text-center text-slate-500 px-4">
                L'inscription est soumise à validation par un administrateur.
              </p>
            </CardFooter>
          </Card>
        </div>
      );
    };

    export default LoginPage;
