export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: 'shipper' | 'courier' | 'admin';
          courier_status: 'pending' | 'approved' | 'rejected' | null;
          organization_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role: 'shipper' | 'courier' | 'admin';
          courier_status?: 'pending' | 'approved' | 'rejected' | null;
          organization_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          shipper_id: string;
          title: string;
          pickup_address: string;
          dropoff_address: string;
          specimen_type: string;
          pickup_at: string;
          required_by: string;
          temperature_requirements: string | null;
          chain_of_custody_notes: string | null;
          special_instructions: string | null;
          offered_price: number;
          notes: string | null;
          status: 'open' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
          accepted_bid_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shipper_id: string;
          title: string;
          pickup_address: string;
          dropoff_address: string;
          specimen_type: string;
          pickup_at: string;
          required_by: string;
          temperature_requirements?: string | null;
          chain_of_custody_notes?: string | null;
          special_instructions?: string | null;
          offered_price: number;
          notes?: string | null;
          status?: 'open' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
          accepted_bid_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'jobs_shipper_id_fkey';
            columns: ['shipper_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_accepted_bid_id_fkey';
            columns: ['accepted_bid_id'];
            referencedRelation: 'bids';
            referencedColumns: ['id'];
          }
        ];
      };
      job_status_events: {
        Row: {
          id: string;
          job_id: string;
          status: 'assigned' | 'accepted' | 'en_route_to_pickup' | 'picked_up' | 'in_transit' | 'delivered';
          note: string | null;
          proof_url: string | null;
          proof_name: string | null;
          received_by_name: string | null;
          delivery_notes: string | null;
          delivered_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          status: 'assigned' | 'accepted' | 'en_route_to_pickup' | 'picked_up' | 'in_transit' | 'delivered';
          note?: string | null;
          proof_url?: string | null;
          proof_name?: string | null;
          received_by_name?: string | null;
          delivery_notes?: string | null;
          delivered_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_status_events']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'job_status_events_job_id_fkey';
            columns: ['job_id'];
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_status_events_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
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
        Relationships: [
          {
            foreignKeyName: 'bids_job_id_fkey';
            columns: ['job_id'];
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bids_courier_id_fkey';
            columns: ['courier_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
