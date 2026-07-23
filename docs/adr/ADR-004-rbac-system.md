# ADR-004: Enterprise RBAC System

## Status: Accepted

## Context
Original permissions system was flat (create_invoice, edit_invoice). No hierarchy, no scope, no time-based restrictions. Insufficient for multi-tenant ERP with diverse user roles.

## Decision
Implement structured RBAC with:
- PermissionScope: own / team / company / platform
- PermissionLevel: none(0) / read(1) / write(2) / approve(3) / admin(4)
- ResourcePermission: resource:action format (invoice:read, invoice:write)
- Role hierarchy: OWNER inherits all permissions
- Time-based restrictions
- Permission audit trail

## Consequences
- Fine-grained access control per resource and scope
- Backward-compatible with legacy flat permission keys
- Every permission check logged for audit
- Support for custom roles via role creation
