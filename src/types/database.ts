export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: 'shipper' | 'courier' | 'admin';
          courier_status: 'pending' | 'approved' | 'rejected' | null;
          organization_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role: 'shipper' | 'courier' | 'admin';
          courier_status?: 'pending' | 'approved' | 'rejected' | null;
          organization_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      jobs: {
        Row: {
          id: string;
          shipper_id: string;
          title: string;
          pickup_address: string;
          dropoff_address: string;
          specimen_type: string;
          required_by: string;
          notes: string | null;
          status: 'open' | 'assigned' | 'completed' | 'cancelled';
          created_at: string;
        };
        Insert: {
          id?: string;
          shipper_id: string;
          title: string;
          pickup_address: string;
          dropoff_address: string;
          specimen_type: string;
          required_by: string;
          notes?: string | null;
          status?: 'open' | 'assigned' | 'completed' | 'cancelled';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>;
      };
      bids: {
        Row: {
          id: string;
          job_id: string;
          courier_id: string;
          amount: number;
          eta_minutes: number;
          note: string | null;
          status: 'pending' | 'accepted' | 'declined';
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          courier_id: string;
          amount: number;
          eta_minutes: number;
          note?: string | null;
          status?: 'pending' | 'accepted' | 'declined';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bids']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
