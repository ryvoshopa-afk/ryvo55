-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255), -- Nullable, links to registered customer email or UUID
    status VARCHAR(50) NOT NULL DEFAULT 'AI_HANDLING' 
        CHECK (status IN ('AI_HANDLING', 'PENDING_CUSTOMER_APPROVAL', 'QUEUED_FOR_HUMAN', 'HUMAN_HANDLING', 'CLOSED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL 
        CHECK (sender_type IN ('customer', 'ai', 'agent', 'system')),
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' 
        CHECK (message_type IN ('text', 'image', 'audio', 'file')),
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE, -- Handles internal notes efficiently
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Create knowledge_suggestions table
CREATE TABLE IF NOT EXISTS knowledge_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create support_operations_logs table
CREATE TABLE IF NOT EXISTS support_operations_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    operator VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

