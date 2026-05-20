# FlexCart — Consolidated System Diagrams

> All diagrams use Mermaid syntax and are consolidated for report use.
> Only DFD remains separated into Level 0, Level 1, and Level 2.

---

## Table of Contents

1. [ER Diagram (Complete)](#1-er-diagram-complete)
2. [Sequence Diagram (Main Workflow)](#2-sequence-diagram-main-workflow)
3. [Use Case Diagram (Complete)](#3-use-case-diagram-complete)
4. [Class Diagram (Core Architecture)](#4-class-diagram-core-architecture)
5. [Activity Diagram (Main Flow)](#5-activity-diagram-main-flow)
6. [Component Diagram (Backend + AI + Frontend)](#6-component-diagram-backend--ai--frontend)
7. [Deployment Diagram (Production View)](#7-deployment-diagram-production-view)
8. [Data Flow Diagram - Level 0](#8-data-flow-diagram---level-0)
9. [Data Flow Diagram - Level 1](#9-data-flow-diagram---level-1)
10. [Data Flow Diagram - Level 2](#10-data-flow-diagram---level-2)

---

## 1. ER Diagram (Complete)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '15px', 'fontFamily': 'Arial'}}}%%
erDiagram
    USERS {
        int id PK
        varchar email UK
        enum role
        int points
    }
    COMPANIES {
        int id PK
        int user_id FK
        varchar name UK
        enum status
    }
    CATEGORIES {
        int id PK
        varchar name UK
    }
    PRODUCTS {
        int id PK
        int company_id FK
        int category_id FK
        decimal price
        int stock
        tinyint negotiable
    }
    ORDERS {
        int id PK
        int user_id FK
        decimal total
        enum status
    }
    ORDER_ITEMS {
        int id PK
        int order_id FK
        int product_id FK
        int qty
        decimal price
    }
    DELIVERIES {
        int id PK
        int order_id FK
        decimal cost
        enum status
    }
    AI_NEGOTIATIONS {
        int id PK
        int user_id FK
        int product_id FK
        decimal final_price
    }
    USERS ||--o{ COMPANIES : owns
    USERS ||--o{ ORDERS : places
    USERS ||--o{ AI_NEGOTIATIONS : initiates
    COMPANIES ||--o{ PRODUCTS : offers
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : in
    PRODUCTS ||--o{ AI_NEGOTIATIONS : for
    ORDERS ||--o{ ORDER_ITEMS : includes
    ORDERS ||--|| DELIVERIES : fulfilled_by
```

---

## 2. Sequence Diagram (Main Workflow)

```mermaid
%%{init: {'theme': 'base', 'sequence': {'mirrorActors': false, 'messageMargin': 16}, 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
sequenceDiagram
    actor SU as Super Admin
    actor SA as Staff Admin
    actor S as Seller
    actor C as Customer
    actor DA as Del. Admin
    actor DB2 as Del. Boy
    participant FE as Frontend
    participant API as API
    participant DB as DB
    participant AI as AI

    SU->>FE: Create Staff Admin
    FE->>API: POST /super-admin/staff
    API->>DB: Add staff account
    SU->>FE: Configure platform
    FE->>API: PUT /super-admin/settings
    API->>DB: Save settings

    C->>FE: Register / Login
    FE->>API: POST /auth/login
    API->>DB: Verify credentials
    API-->>FE: Auth token + role

    S->>FE: Submit company
    FE->>API: POST /companies
    API->>DB: Save (pending)

    SA->>FE: Review companies
    SA->>FE: Approve / Reject
    FE->>API: POST /verify/:id
    API->>DB: Update status

    SA->>FE: Manage users & orders
    FE->>API: GET /admin/users
    API->>DB: Fetch records

    S->>FE: Add product
    FE->>API: POST /products
    API->>DB: Save product

    C->>FE: Browse & add to cart
    FE->>API: GET /products
    FE->>API: POST /cart
    API->>DB: Update cart

    C->>FE: Negotiate price
    FE->>API: POST /negotiate
    API->>AI: Evaluate offer
    AI-->>API: Counter / accept
    API-->>FE: Negotiation result

    C->>FE: Place order
    FE->>API: POST /orders
    API->>DB: Create order + items
    API-->>FE: Order confirmed

    DA->>FE: Assign delivery
    FE->>API: POST /delivery/assign
    API->>DB: Create delivery record
    API-->>FE: Assigned

    DB2->>FE: Update status & proof
    FE->>API: PUT /delivery/proof
    API->>DB: Mark delivered

    C->>FE: Track order
    FE->>API: GET /orders/:id
    API-->>FE: Delivery status
```

---

## 3. Use Case Diagram (Complete)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
flowchart LR
    C([Customer])
    S([Seller])
    SA([Staff Admin])
    SU([Super Admin])
    DA([Del. Admin])
    DB([Del. Boy])

    subgraph Sys[FlexCart System]
        UC1([Register / Login])
        UC2([Browse & Search])
        UC3([Cart & Checkout])
        UC4([Negotiate Price])
        UC5([Track Order])
        UC6([Review Product])
        UC7([Submit Company])
        UC8([Manage Products])
        UC9([Approve Company])
        UC10([Manage Users])
        UC11([Assign Delivery])
        UC12([Platform Settings])
        UC13([Submit Proof])
    end

    C --> UC1
    C --> UC2
    C --> UC3
    C --> UC4
    C --> UC5
    C --> UC6

    S --> UC1
    S --> UC7
    S --> UC8

    SA --> UC9
    SA --> UC10
    SA --> UC11

    SU --> UC12
    SU --> UC10

    DA --> UC11
    DB --> UC13

    UC4 -.uses.-> UC3
    UC3 --> UC5
```

---

## 4. Class Diagram (Core Architecture)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
classDiagram
    class User {
        -id: int
        -email: string
        -role: enum
        +login()
        +register()
    }
    class Company {
        -id: int
        -name: string
        -status: enum
        +submit()
        +approve()
    }
    class Product {
        -id: int
        -price: decimal
        -stock: int
        -negotiable: bool
        +create()
        +update()
    }
    class Cart {
        -userId: int
        +addItem()
        +checkout()
    }
    class Order {
        -id: int
        -total: decimal
        -status: enum
        +place()
        +cancel()
    }
    class Delivery {
        -id: int
        -status: enum
        +assign()
        +submitProof()
    }
    class Negotiation {
        -id: int
        -finalPrice: decimal
        -status: enum
        +start()
        +evaluate()
    }

    User "1" --> "*" Company : owns
    Company "1" --> "*" Product : offers
    User "1" --> "1" Cart : has
    Cart --> Order : converts to
    User "1" --> "*" Order : places
    Order "1" --> "1" Delivery : has
    User "1" --> "*" Negotiation : initiates
    Product "1" --> "*" Negotiation : subject_of
```

---

## 5. Activity Diagram (Main Flow)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '15px', 'fontFamily': 'Arial'}}}%%
flowchart LR
    ST([Start]) --> L[Login]
    L --> R{Role?}

    R -->|Customer| C1[Browse Products]
    C1 --> C2[Add to Cart]
    C2 --> C3[Negotiate Price]
    C3 --> C4[Place Order]
    C4 --> C5[Track Delivery]
    C5 --> EN([End])

    R -->|Seller| S1[Submit Company]
    S1 --> S2[Add Products]
    S2 --> S3[Manage Listings]
    S3 --> EN

    R -->|Staff Admin| A1[Review Requests]
    A1 --> A2[Approve/Reject]
    A2 --> A3[Manage Users]
    A3 --> EN

    R -->|Super Admin| SU1[Manage Staff]
    SU1 --> SU2[Platform Config]
    SU2 --> SU3[View Reports]
    SU3 --> EN

    R -->|Del. Admin| DA1[View Orders]
    DA1 --> DA2[Assign Del. Boy]
    DA2 --> DA3[Monitor Status]
    DA3 --> EN

    R -->|Del. Boy| DB1[View Tasks]
    DB1 --> DB2[Update Status]
    DB2 --> DB3[Submit Proof]
    DB3 --> EN
```

---

## 6. Component Diagram (Backend + AI + Frontend)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
flowchart TB
    FE[React Frontend]

    subgraph API[Express API]
        AUTH[Auth]
        PROD[Product]
        ORD[Order]
        NEG[Negotiation]
        DEL[Delivery]
        ADM[Admin]
    end

    subgraph DATA[Data Layer]
        DB[(MySQL)]
        AI[Python AI]
        WS[Socket.IO]
    end

    FE --> AUTH
    FE --> PROD
    FE --> ORD
    FE --> NEG
    FE --> DEL
    FE --> ADM
    FE <-->|Events| WS

    AUTH --> DB
    PROD --> DB
    ORD --> DB
    NEG --> DB
    DEL --> DB
    ADM --> DB
    NEG --> AI
    PROD --> AI
```

---

## 7. Deployment Diagram (Production View)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
flowchart TB
    U([All Users])

    subgraph CL[Client Tier]
        BR[Web Browser]
    end

    subgraph APP[Application Tier]
        API[Node.js API]
        WS[Socket.IO]
    end

    subgraph SVC[AI Services]
        AI[Python AI]
    end

    subgraph DB[Database Tier]
        SQL[(MySQL)]
    end

    U --> BR
    BR -->|HTTPS| API
    BR <-->|WebSocket| WS
    API --> SQL
    API --> AI
    WS --> SQL
```

---

## 8. Data Flow Diagram - Level 0

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '15px', 'fontFamily': 'Arial'}}}%%
flowchart LR
    C([Customer])
    S([Seller])
    SA([Staff Admin])
    SU([Super Admin])
    D([Delivery])
    AI([AI])

    SYS[FlexCart System]

    C -->|Orders & Requests| SYS
    SYS -->|Products & Status| C
    S -->|Products & Data| SYS
    SYS -->|Analytics| S
    SA -->|Verify & Manage| SYS
    SU -->|Governance| SYS
    D -->|Assign & Track| SYS
    SYS <-->|AI Context| AI
```

---

## 9. Data Flow Diagram - Level 1

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'Arial'}}}%%
flowchart TD
    C([Customer])
    S([Seller])
    SA([Staff Admin])
    SU([Super Admin])
    D([Delivery])
    AI([AI])

    P1[1. Auth]
    P2[2. Catalog]
    P3[3. Orders]
    P4[4. Delivery]
    P5[5. Negotiation]
    P6[6. Admin]

    D1[(Users)]
    D2[(Products)]
    D3[(Orders)]
    D4[(Delivery)]

    C --> P1
    S --> P1
    P1 <--> D1

    S --> P2
    SA --> P2
    P2 <--> D2

    C --> P3
    P3 <--> D2
    P3 <--> D3

    D --> P4
    P4 <--> D3
    P4 <--> D4

    C --> P5
    AI --> P5
    P5 <--> D2

    SA --> P6
    SU --> P6
    P6 <--> D1
    P6 <--> D3
```

---

## 10. Data Flow Diagram - Level 2

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '13px', 'fontFamily': 'Arial'}}}%%
flowchart TD
    C([Customer])
    S([Seller])
    SA([Staff Admin])
    SU([Super Admin])
    D([Delivery])
    AI([AI])

    P1[1.1 Login]
    P2[2.1 Company Mgmt]
    P3[2.2 Product Mgmt]
    P4[3.1 Cart & Order]
    P5[4.1 Assign Delivery]
    P6[4.2 Track & Proof]
    P7[5.1 AI Negotiate]
    P8[6.1 Admin Ops]

    D1[(Users)]
    D2[(Companies)]
    D3[(Products)]
    D4[(Orders)]
    D5[(Delivery)]
    D6[(Negotiations)]

    C --> P1
    S --> P1
    P1 <--> D1

    S --> P2
    SA --> P2
    P2 <--> D2

    S --> P3
    P3 <--> D3
    P3 <--> D2

    C --> P4
    P4 <--> D3
    P4 <--> D4

    D --> P5
    P5 <--> D5
    P5 <--> D4

    D --> P6
    P6 <--> D5
    P6 <--> D4

    C --> P7
    AI --> P7
    P7 <--> D6
    P7 <--> D3

    SA --> P8
    SU --> P8
    P8 <--> D1
    P8 <--> D2
    P8 <--> D4
```

---

Generated for FlexCart Final Project (consolidated report version)
