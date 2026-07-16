# OurWed Database Design

Version: 1.0

---

# Philosophy

The database reflects the real workflow of a wedding creator.

Everything starts with a Wedding.

Every other object belongs to a Wedding.

The database should remain simple, scalable and modular.

---

# Main Objects

Workspace

↓

User

↓

Wedding

↓

Everything else

---

# Entity Overview

Workspace

├── Users

├── Weddings

├── Equipment

├── Packages

├── Settings

└── Notifications

Wedding

├── Couple

├── Contract

├── Payments

├── Questionnaires

├── Timeline

├── Tasks

├── Deliverables

├── Equipment Checklist

├── Notes

├── Files

└── Workflow Stage

---



# Database Principles

Every table has:

id

created_at

updated_at

Every table belongs to a Workspace.

Every Wedding belongs to one Workspace.

Never duplicate data.

---



# ---



# Table: weddings

Represents one confirmed wedding booking.

## Fields

id

workspace_id

workflow_stage

status

wedding_date

ceremony_name

ceremony_address

ceremony_latitude

ceremony_longitude

reception_name

reception_address

reception_latitude

reception_longitude

package_id

price

deposit_amount

remaining_amount

currency

booking_date

delivery_deadline

notes

created_at

updated_at  

---



# Business Objects

The application consists of the following business objects.

Workspace

│

├── Users

│

├── Weddings

│   ├── Couple

│   ├── Workflow

│   ├── Payments

│   ├── Documents

│   ├── Questionnaires

│   ├── Timeline

│   ├── Deliverables

│   ├── Tasks

│   ├── Equipment Checklist

│   ├── Notes

│   ├── Files

│   └── Activity

│

├── Equipment

│

├── Packages

│

├── Services

│

├── Notification Templates

│

└── Settings



---

# Table: couples

Stores couple information.

## Fields

id

wedding_id

partner_one_first_name

partner_one_last_name

partner_two_first_name

partner_two_last_name

email

phone

address

postal_code

city

country

instagram

notes

created_at

updated_at  
  
---

# Table: packages

Package templates.

Example:

Premium Film

Classic Film

Photo + Film

Photo

## Fields

id

workspace_id

name

description

base_price

color

is_active

created_at

updated_at  
  
---

# Table: services

Defines deliverables.

Examples:

Feature Film

Highlight

Trailer

Instagram Reel

Gallery

Album

Raw Files

Drone

## Fields

id

workspace_id

name

delivery_days

description

created_at

updated_at  
  
---

# Table: package_services

## Fields

id

package_id

service_id  
  
