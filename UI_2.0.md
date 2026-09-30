# Service Desk 2.0 UI architecture

Service Desk 2.0 replaces the active chain of visual release overlays with a single product design system and shell controller. The goal is a Jira Service Management-like information architecture without copying Atlassian screens 1:1.

## Product shell
- persistent service-management navigation rail;
- sticky product top bar with route context;
- one content canvas for queue, ticket, project and administration work;
- responsive desktop/tablet/mobile rules;
- shared tokens for surfaces, spacing, typography, status and interaction states.

## Administration Center
Global settings remain in /#/settings and are visually separated from project configuration. The left rail is searchable and intended for System, Identity & Access, Mail & Notifications, Security, Integrations, Updates and Advanced areas.

## Project settings
Project-level service configuration is persisted in schema 9 through project_service_settings. This is the home for request intake, portal presentation, queue defaults and project workspace behavior instead of mixing them with global administration.

## Agent workspace
Queues use a dense work surface with filters and a stable table. Tickets use a two-column workspace: activity/content on the left and a contextual inspector on the right.

## Customer portal
The customer-facing route is intentionally visually simpler than the agent/admin application and is prepared for service catalog categories backed by schema 9.

## Compatibility
release-1.1.2.js is temporarily retained for behavior that has not yet been moved out of the 1.x compatibility layer. 1.2.x and 1.6 visual decorators are no longer active in index.html. New visual work belongs in design-system.css and structural shell work in product-shell.js.
