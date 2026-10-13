export type Role = "manager" | "worker";
export type OrderStatus = "pending" | "review" | "valued" | "sent";
export type LocationType = "unit" | "common" | "exterior" | "other";

export interface Profile {
  id: string;
  name: string;
  role: Role;
  email?: string;
}

export interface Company {
  name: string;
  taxId: string;
  address: string;
  email: string;
  phone: string;
  defaultVat: number;
  laborRate: number;
}

export interface Client {
  id: string;
  name: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  site: string;
}

export interface MaterialItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface OrderPhoto {
  id: string;
  path: string;
  url?: string;
  name: string;
}

export interface Order {
  id: string;
  number: string;
  title: string;
  description: string;
  clientId: string;
  clientName: string;
  site: string;
  locationType: LocationType;
  locationDetail: string;
  priority: "normal" | "urgent";
  status: OrderStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  serviceDate: string;
  hours: number;
  laborRate: number;
  vatRate: number;
  items: MaterialItem[];
  notes: string;
  assistance: boolean;
  assistanceNote: string;
  version: number;
  photos: OrderPhoto[];
}

type ServerOrderFields =
  | "number"
  | "createdBy"
  | "createdByName"
  | "createdAt"
  | "updatedAt"
  | "version";
export type OrderDraft = Omit<Order, ServerOrderFields> &
  Partial<Pick<Order, ServerOrderFields>>;

export interface AuditEntry {
  id: string;
  orderId?: string;
  actorName: string;
  action: string;
  createdAt: string;
  changes?: Record<string, unknown>;
}

export interface AppData {
  orders: Order[];
  clients: Client[];
  company: Company;
  profiles: Profile[];
  audit: AuditEntry[];
}

export interface DataEvent {
  kind: "auth" | "orders" | "audit" | "settings" | "recovery";
  newOrderId?: string;
}

export interface AppRepository {
  getSession(): Promise<Profile | null>;
  login(email: string, password: string): Promise<Profile>;
  logout(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  selectDemoProfile(role: Role): Promise<Profile>;
  load(): Promise<AppData>;
  saveOrder(order: OrderDraft, expectedVersion?: number): Promise<Order>;
  saveCompany(company: Company): Promise<void>;
  saveClient(client: Client): Promise<Client>;
  setProfileRole(id: string, role: Role): Promise<void>;
  uploadPhoto(orderId: string, file: File): Promise<OrderPhoto>;
  getPhotoUrl(path: string): Promise<string>;
  subscribe(callback: (event: DataEvent) => void): () => void;
}
