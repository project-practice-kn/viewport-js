declare global {
  namespace App {
    interface Locals {
      user: { id: string; name: string } | null;
    }
  }
}
export {};
