# OurWed — Product Specification

Version: 1.0

---

# Product Overview

OurWed is a premium SaaS platform designed specifically for wedding photographers and wedding filmmakers.

It helps professionals manage every wedding from the moment a client books the date until the final delivery of photos or films.

The application replaces multiple disconnected tools with one organized workspace.

---

# Product Goal

The goal of OurWed is simple:

Help wedding creators spend less time managing their business and more time creating.

Every feature should either:

- save time

- reduce stress

- improve organization

- prevent mistakes

If a feature does not achieve at least one of these goals, it should not be added.

---

# The Core Object

Everything in the application revolves around one object:

Wedding

Every other feature belongs to a wedding.

Examples:

Wedding

├── Couple

├── Payments

├── Contract

├── Questionnaires

├── Equipment

├── Timeline

├── Notes

├── Deliverables

├── Files

├── Tasks

└── Notifications

There is no "client" without a wedding.

The wedding is always the primary object.

---

# Primary Workflow

The expected workflow is:

Booking confirmed

↓

Create Wedding

↓

Send Contract Questionnaire

↓

Generate Contract

↓

Receive Signed Contract

↓

Receive Deposit

↓

Planning

↓

Wedding Day

↓

Post Production

↓

Delivery

↓

Archive

Every feature in the application should support this workflow.

---

# MVP Features

Version 1 includes only the features required for everyday work.

## Dashboard

Overview of today's work.

Upcoming weddings.

Deadlines.

Notifications.

Quick actions.

---

## Wedding List

Card based layout.

Fast filtering.

Search.

Status indicators.

---

## Wedding Details

The most important screen.

Contains:

Overview

Timeline

Payments

Documents

Questionnaires

Equipment

Tasks

Notes

Files

History

---

## Calendar

Wedding calendar.

Meetings.

Deadlines.

Editing schedule.

---

## Tasks

Personal tasks.

Wedding tasks.

Automatic reminders.

---

## Equipment

Equipment database.

Packing checklist.

Assigned equipment.

Missing equipment.

---

## Payments

Price.

Deposit.

Remaining balance.

Deadlines.

Payment history.

---

## Questionnaires

Contract questionnaire.

Wedding questionnaire.

Automatic reminders.

Status tracking.

---

## Documents

Contracts.

Invoices (future).

Attachments.

PDF generation.

---

## Notifications

Smart reminders.

Missing payments.

Missing questionnaires.

Upcoming weddings.

Deadlines.

---

## Settings

Language.

Account.

Workspace.

Appearance.

Notifications.

---

# What Makes OurWed Different

OurWed is not a CRM.

It is not focused on sales.

It starts after the booking is confirmed.

Its purpose is operational excellence.

It helps creators deliver better work.

---

# Future Modules

Artificial Intelligence

Client Portal

Email Integration

Cloud Storage

Calendar Sync

Statistics

Automation

Invoices

Mobile App

---

# Workspace

Each account belongs to one Workspace.

Workspace stores:

Business Name

Role

Settings

Branding

Members (future)

Modules

---

# User Roles

MVP:

Wedding Photographer

Wedding Filmmaker

Photo + Film Studio

Future:

Wedding Planner

DJ

Band

Decorator

Florist

Venue

The system architecture must support enabling different modules depending on the workspace role.

---

# Product Principles

Simple.

Fast.

Reliable.

Elegant.

Focused.

Professional.

Never overwhelming.

---

# Success Metric

A successful product allows a wedding creator to manage an entire wedding season inside one application without relying on multiple external tools.

---

End of document.