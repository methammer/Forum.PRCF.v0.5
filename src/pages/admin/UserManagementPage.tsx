import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { Users, Loader2, ShieldCheck, ShieldAlert, UserCog, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import { toast } from '@/hooks/use-toast';
import { useUser } from "@/contexts/UserContext"; // Import useUser

export type UserProfile = {
  id: string;
  email: string | null;
  created_at: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  status: 'pending_approval' | 'approved' | 'rejected' | null;
  role: 'user' | 'moderator' | 'admin' | 'SUPER_ADMIN' | null; // Added SUPER_ADMIN
};

const UserManagementPage = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Keep this for data fetching state
  const [error, setError] = useState<string | null>(null);
  
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [currentAdminUserId, setCurrentAdminUserId] = useState<string | null>(null);

  const { user: contextUser, profile: contextProfile, isLoadingAuth: isAuthLoading } = useUser();

  const fetchUsers = useCallback(async () => {
    console.log("UserManagementPage: fetchUsers called.");
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_all_user_details');
      if (rpcError) {
        console.error("UserManagementPage: Error from get_all_user_details RPC:", rpcError);
        throw rpcError;
      }
      console.log("UserManagementPage: Users fetched successfully:", data);
      setUsers(data as UserProfile[] || []);
    } catch (err: any) {
      console.error("UserManagementPage: Error fetching users in fetchUsers catch block:", err);
      const errorMessage = err.message || "Erreur lors de la récupération de la liste des utilisateurs.";
      setError(errorMessage);
      toast({
        title: "Erreur de chargement des utilisateurs",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log("UserManagementPage: useEffect triggered. isAuthLoading:", isAuthLoading, "ContextUser:", !!contextUser, "ContextProfile Role:", contextProfile?.role);
    if (!isAuthLoading && contextUser && contextProfile) {
      setCurrentAdminUserId(contextUser.id);
      if (contextProfile.role === 'admin' || contextProfile.role === 'SUPER_ADMIN') {
        console.log("UserManagementPage: Admin authenticated, calling fetchUsers.");
        fetchUsers();
      } else {
        console.log("UserManagementPage: User not admin, access denied.");
        setError("Accès refusé. Vous n'avez pas les permissions nécessaires pour voir cette page.");
        setIsLoading(false);
        setUsers([]); // Clear users if not admin
      }
    } else if (!isAuthLoading && !contextUser) {
      console.log("UserManagementPage: User not authenticated.");
      setError("Veuillez vous connecter pour accéder à cette page.");
      setIsLoading(false);
      setUsers([]); // Clear users if not authenticated
    } else if (isAuthLoading) {
      console.log("UserManagementPage: Auth is loading, waiting...");
      // Optionally set a loading message or keep existing loader
      setIsLoading(true); // Ensure main loader shows while auth is processing
    }
  }, [isAuthLoading, contextUser, contextProfile, fetchUsers]);


  const getRoleBadgeVariant = (role: UserProfile['role']) => {
    switch (role) {
      case 'admin':
      case 'SUPER_ADMIN':
        return 'destructive';
      case 'moderator':
        return 'secondary';
      case 'user':
      default:
        return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: UserProfile['status']) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'pending_approval':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      default:
        return 'outline';
    }
  };
  
  const handleApproveUser = async (userId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ status: 'approved' })
        .eq('id', userId);
      if (updateError) throw updateError;
      toast({ title: "Succès", description: "Utilisateur approuvé." });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible d'approuver l'utilisateur.", variant: "destructive" });
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserProfile['role']) => {
     if (!newRole) {
        toast({ title: "Erreur", description: "Nouveau rôle non spécifié.", variant: "destructive" });
        return;
    }
    // Prevent admin from demoting themselves if they are the only SUPER_ADMIN or a regular admin demoting self
    if (userId === currentAdminUserId && contextProfile?.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
        // Potentially add a check if they are the *only* SUPER_ADMIN
        // For now, let's assume a SUPER_ADMIN can change their own role if needed, but be cautious.
        // If it's a regular admin, they shouldn't demote themselves from 'admin' easily.
    }
    if (userId === currentAdminUserId && contextProfile?.role === 'admin' && newRole !== 'admin') {
         toast({ title: "Action non autorisée", description: "Les administrateurs ne peuvent pas changer leur propre rôle directement de cette manière.", variant: "destructive" });
         return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (updateError) throw updateError;
      toast({ title: "Succès", description: `Rôle de l'utilisateur mis à jour en ${newRole}.` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de changer le rôle.", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string | null) => {
    if (currentAdminUserId === userId) {
      toast({ title: "Action non autorisée", description: "Vous ne pouvez pas supprimer votre propre compte administrateur.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${userEmail || userId}? Cette action est irréversible.`)) {
      return;
    }
    try {
      const { error: functionError } = await supabase.functions.invoke('delete-user-admin', {
        body: { userIdToDelete: userId },
      });

      if (functionError) throw functionError;

      toast({ title: "Succès", description: `Utilisateur ${userEmail || userId} supprimé.` });
      fetchUsers();
    } catch (err: any) {
      console.error("Error deleting user:", err);
      toast({
        title: "Erreur de suppression",
        description: err.message || "Impossible de supprimer l'utilisateur.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setSelectedUserForEdit(user);
    setIsEditUserDialogOpen(true);
  };

  if (isAuthLoading || (isLoading && users.length === 0 && !error) ) { 
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg dark:text-gray-300">Chargement des utilisateurs...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-4 rounded-md text-center">{error}</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
            Gestion des Utilisateurs
          </h1>
          <p className="mt-1 text-md text-gray-600 dark:text-gray-300">
            Visualiser, modifier et gérer les comptes utilisateurs. ({users.length} utilisateurs)
          </p>
        </div>
        <CreateUserDialog onUserCreated={fetchUsers} />
      </header>

      <Card className="dark:bg-gray-800 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl text-gray-800 dark:text-white">
            <Users className="mr-2 h-6 w-6 text-blue-500 dark:text-blue-400" />
            Liste des Utilisateurs
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            {users.length > 0 ? `Total de ${users.length} utilisateurs.` : "Aucun utilisateur trouvé."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 && !isLoading ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Aucun utilisateur à afficher. Vérifiez les permissions ou réessayez.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">Utilisateur</TableHead>
                    <TableHead className="dark:text-gray-300">Email</TableHead>
                    <TableHead className="dark:text-gray-300">Rôle</TableHead>
                    <TableHead className="dark:text-gray-300">Statut</TableHead>
                    <TableHead className="dark:text-gray-300">Inscrit le</TableHead>
                    <TableHead className="text-right dark:text-gray-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="dark:border-gray-700 hover:dark:bg-gray-700/50">
                      <TableCell className="dark:text-gray-200">
                        <div className="font-medium">{user.full_name || user.username || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground dark:text-gray-400">{user.username || user.id}</div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">{user.email || 'Non fourni'}</TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)} className="capitalize">
                          {user.role?.replace('SUPER_ADMIN', 'Super Admin') || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(user.status)} className="capitalize">
                          {user.status?.replace('_', ' ') || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="dark:text-gray-400 dark:hover:bg-gray-700">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                            <DropdownMenuLabel className="dark:text-gray-300">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditDialog(user)} className="dark:text-gray-300 dark:hover:!bg-gray-700">
                              <UserCog className="mr-2 h-4 w-4" /> Modifier
                            </DropdownMenuItem>
                            {user.status === 'pending_approval' && (
                              <DropdownMenuItem onClick={() => handleApproveUser(user.id)} className="dark:text-gray-300 dark:hover:!bg-gray-700">
                                <ShieldCheck className="mr-2 h-4 w-4" /> Approuver
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="dark:bg-gray-700" />
                            <DropdownMenuItem 
                                onClick={() => handleChangeRole(user.id, 'moderator')} 
                                className="dark:text-gray-300 dark:hover:!bg-gray-700" 
                                disabled={(user.id === currentAdminUserId && (contextProfile?.role === 'admin' || contextProfile?.role === 'SUPER_ADMIN')) || user.role === 'moderator'}>
                               <ShieldAlert className="mr-2 h-4 w-4" /> Passer Modérateur
                            </DropdownMenuItem>
                             <DropdownMenuItem 
                                onClick={() => handleChangeRole(user.id, 'admin')} 
                                className="dark:text-gray-300 dark:hover:!bg-gray-700" 
                                disabled={user.role === 'admin' || user.role === 'SUPER_ADMIN'}>
                               <ShieldAlert className="mr-2 h-4 w-4" /> Passer Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={() => handleChangeRole(user.id, 'user')} 
                                className="dark:text-gray-300 dark:hover:!bg-gray-700" 
                                disabled={(user.id === currentAdminUserId && (contextProfile?.role === 'admin' || contextProfile?.role === 'SUPER_ADMIN')) || user.role === 'user'}>
                               <ShieldAlert className="mr-2 h-4 w-4" /> Passer Utilisateur
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="dark:bg-gray-700"/>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteUser(user.id, user.email)} 
                              className="text-red-600 dark:text-red-500 hover:!text-red-700 dark:hover:!text-red-400 dark:hover:!bg-red-700/50"
                              disabled={user.id === currentAdminUserId}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <EditUserDialog 
        user={selectedUserForEdit} 
        isOpen={isEditUserDialogOpen} 
        onOpenChange={setIsEditUserDialogOpen} 
        onUserUpdated={() => {
          fetchUsers();
          setSelectedUserForEdit(null);
        }} 
      />
    </div>
  );
};

export default UserManagementPage;
