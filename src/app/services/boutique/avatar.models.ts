export type AvatarRarity = 'COMMUN' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';

export interface AvatarDto {
  id: number;
  code: string;
  nom: string;
  rarete: AvatarRarity;
  prix: number;
  imageUrl?: string;
  actif: boolean;
  defaut: boolean;
}

export interface InventoryAvatarDto {
  id: number;          // id du lien utilisateur-avatar
  avatarId: number;    // id de l'avatar
  code: string;
  nom: string;
  rarete: AvatarRarity;
  imageUrl?: string;
  equipe: boolean;
  dateAcquisition?: string; // ISO string
}

export interface EquippedAvatarDto {
  avatarId: number;
  code: string;
  nom: string;
  rarete: AvatarRarity;
  imageUrl?: string;
}
