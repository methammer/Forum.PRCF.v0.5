import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from '@/hooks/use-toast'; // Corrected import path
import { UserProfile } from '@/pages/admin/UserManagementPage'; // Import the UserProfile type

const userRoles = ['user', 'moderator', 'admin'] as const;
const userStatuses = ['pending_approval', 'approved', 'rejected'] as const;

const editUserSchema = z.object({
  full_name: z.string().min(2, { message: "Le nom complet doit contenir au moins 2 caractères." }).optional(),
  username: z.string().min(3, { message: "Le nom d'utilisateur doit contenir au moins 3 caractères." }).optional(),
  email: z.string().email({ message: "Adresse e-mail invalide." }), // Email is typically not changed easily
  role: z.enum(userRoles, { errorMap: () => ({ message: "Rôle invalide." }) }),
  status: z.enum(userStatuses, { errorMap: () => ({ message: "Statut invalide." }) }),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

interface EditUserDialogProps {
  user: UserProfile | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: () => void;
}

export const EditUserDialog: React.FC<EditUserDialogProps> = ({ user, isOpen, onOpenChange, onUserUpdated }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
  });

  useEffect(() => {
    if (user) {
      form.reset({
        full_name: user.full_name || '',
        username: user.username || '',
        email: user.email || '', // Display email, but it's not part of the update schema for profiles
        role: user.role || 'user',
        status: user.status || 'pending_approval',
      });
    }
  }, [user, form, isOpen]);

  const onSubmit = async (data: EditUserFormData) => {
    if (!user) return;
    setIsSubmitting(true);

    const profileUpdateData: Partial<UserProfile> = {
      full_name: data.full_name,
      username: data.username,
      role: data.role,
      status: data.status,
    };

    // Remove undefined fields so they don't overwrite existing values with null in Supabase
    Object.keys(profileUpdateData).forEach(key => 
        profileUpdateData[key as keyof Partial<UserProfile>] === undefined && delete profileUpdateData[key as keyof Partial<UserProfile>]
    );
    
    console.log("Updating profile with data:", profileUpdateData);

    try {
      const { error } = await supabase
        .from('profiles')
        .update(profileUpdateData)
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Utilisateur mis à jour",
        description: `Le profil de ${user.email} a été mis à jour.`,
      });
      onUserUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Erreur de mise à jour",
        description: error.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handlePasswordReset = async () => {
    if (!user || !user.email) return;
    toast({
        title: "Réinitialisation de mot de passe (TODO)",
        description: `Une Edge Function serait nécessaire pour envoyer un lien de réinitialisation à ${user.email} via supabase.auth.admin.generateLink() ou pour permettre à un admin de définir un nouveau mot de passe via supabase.auth.admin.updateUserById().`,
        variant: "default",
        duration: 7000,
    });
    // Example:
    // const { data, error } = await supabase.auth.resetPasswordForEmail(user.email, {
    //   redirectTo: `${window.location.origin}/update-password`, // Your password update page
    // });
    // if (error) { /* handle error */ } else { /* show success */ }
    // OR for admin direct reset (needs Edge Function):
    // supabase.auth.admin.updateUserById(user.id, { password: newPassword })
  };


  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Modifier l'utilisateur</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Mettre à jour les informations de {user.email || user.id}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-300">Nom complet</FormLabel>
                  <FormControl>
                    <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-300">Nom d'utilisateur</FormLabel>
                  <FormControl>
                    <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormItem>
                <FormLabel className="dark:text-gray-300">Email (non modifiable ici)</FormLabel>
                <FormControl>
                    <Input type="email" value={user.email || ''} readOnly disabled className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400" />
                </FormControl>
                <FormMessage />
            </FormItem>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-300">Rôle</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <SelectValue placeholder="Sélectionner un rôle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                      {userRoles.map(roleValue => (
                        <SelectItem key={roleValue} value={roleValue} className="capitalize hover:dark:bg-gray-700">
                          {roleValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-300">Statut</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <SelectValue placeholder="Sélectionner un statut" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                      {userStatuses.map(statusValue => (
                        <SelectItem key={statusValue} value={statusValue} className="capitalize hover:dark:bg-gray-700">
                          {statusValue.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <Button type="button" variant="outline" onClick={handlePasswordReset} className="w-full dark:text-blue-400 dark:border-blue-500 dark:hover:bg-blue-700/20">
                Réinitialiser le mot de passe (TODO)
            </Button>
            <DialogFooter>
               <DialogClose asChild>
                <Button type="button" variant="outline" className="dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600">
                {isSubmitting ? 'Mise à jour...' : 'Sauvegarder'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
