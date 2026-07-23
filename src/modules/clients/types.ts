"use client";

export interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  companySlug: string;
}
