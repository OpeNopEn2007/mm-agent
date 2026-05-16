#!/usr/bin/env python3
"""
HMML MCP Server

Provides MCP tools for Hierarchical Mathematical Modeling Library retrieval.
Integrates with Claude Code via MCP protocol.

Tools:
- hmml_retrieve: Retrieve relevant modeling methods
- hmml_insert: Insert new methods into the library

Based on scripts/hmml_retrieval.py implementation.
"""

import json
import sys
from pathlib import Path
from typing import Any, Sequence

# MCP SDK
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: mcp package not installed. Install with:")
    print("  pip install mcp")
    sys.exit(1)

# Import retrieval logic from existing script
SERVER_DIR = Path(__file__).parent.parent.parent  # Project root
sys.path.insert(0, str(SERVER_DIR / "scripts"))

from hmml_retrieval import (
    load_method_embeddings,
    retrieve_methods,
    compute_query_embedding,
    cosine_similarity
)

# Configuration
KNOWLEDGE_DIR = SERVER_DIR / "knowledge" / "hmml"
EMBEDDINGS_PATH = KNOWLEDGE_DIR / "hmml-embeddings.npy"
INDEX_PATH = KNOWLEDGE_DIR / "method-index.json"
HMML_PATH = KNOWLEDGE_DIR / "hmml.json"

# Load knowledge base at startup
print("Loading HMML knowledge base...")
embeddings, method_index, hmml_data = load_method_embeddings(
    EMBEDDINGS_PATH, INDEX_PATH, HMML_PATH
)
print(f"Loaded {len(method_index)} methods")

# Create MCP server
server = Server("hmml-server")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available MCP tools"""
    return [
        Tool(
            name="hmml_retrieve",
            description="Retrieve relevant mathematical modeling methods from HMML knowledge base using semantic similarity",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Query text describing the modeling task/problem"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of methods to retrieve (default: 6)",
                        "default": 6
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="hmml_insert",
            description="Insert a new modeling method into the HMML knowledge base",
            inputSchema={
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Method domain (e.g., 'Optimization')"
                    },
                    "subdomain": {
                        "type": "string",
                        "description": "Method subdomain (e.g., 'Linear Programming')"
                    },
                    "method": {
                        "type": "string",
                        "description": "Method name"
                    },
                    "core_idea": {
                        "type": "string",
                        "description": "Core idea of the method"
                    },
                    "application": {
                        "type": "string",
                        "description": "Application scenarios"
                    }
                },
                "required": ["domain", "subdomain", "method", "core_idea", "application"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> Sequence[TextContent]:
    """Execute MCP tool calls"""

    if name == "hmml_retrieve":
        query = arguments.get("query", "")
        top_k = arguments.get("top_k", 6)

        if not query:
            return [TextContent(type="text", text="Error: query parameter required")]

        try:
            # Retrieve methods
            results = retrieve_methods(
                query,
                embeddings,
                method_index,
                hmml_data,
                top_k=top_k
            )

            # Format output
            output = {
                "query": query,
                "methods": results,
                "count": len(results)
            }

            return [TextContent(
                type="text",
                text=json.dumps(output, indent=2, ensure_ascii=False)
            )]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error during retrieval: {str(e)}"
            )]

    elif name == "hmml_insert":
        # Extract parameters
        domain = arguments.get("domain")
        subdomain = arguments.get("subdomain")
        method = arguments.get("method")
        core_idea = arguments.get("core_idea")
        application = arguments.get("application")

        # Build method description
        description = f"<core_idea>: {core_idea} <application>: {application}"

        # Update hmml.json (append to existing structure)
        # Note: This is a simplified implementation
        # Full implementation would recompute embeddings

        try:
            # Load current HMML
            with open(HMML_PATH, 'r', encoding='utf-8') as f:
                current_hmml = json.load(f)

            # Find domain/subdomain or create new entry
            inserted = False
            for domain_node in current_hmml:
                if domain_node.get("method_class", "").strip(":") == domain:
                    for subdomain_node in domain_node.get("children", []):
                        if subdomain_node.get("method_class", "").strip(":") == subdomain:
                            # Add method to existing subdomain
                            subdomain_node["children"].append({
                                "method": method,
                                "description": description
                            })
                            inserted = True
                            break
                    if not inserted:
                        # Create new subdomain under existing domain
                        domain_node["children"].append({
                            "method_class": subdomain + ":",
                            "children": [{
                                "method": method,
                                "description": description
                            }]
                        })
                        inserted = True
                    break

            if not inserted:
                # Create new domain with subdomain and method
                current_hmml.append({
                    "method_class": domain + ":",
                    "children": [{
                        "method_class": subdomain + ":",
                        "children": [{
                            "method": method,
                            "description": description
                        }]
                    }]
                })

            # Save updated HMML
            with open(HMML_PATH, 'w', encoding='utf-8') as f:
                json.dump(current_hmml, f, indent=2, ensure_ascii=False)

            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": True,
                    "message": f"Method '{method}' inserted into {domain}/{subdomain}",
                    "note": "Run hmml_precompute_embeddings.py to update embeddings"
                }, indent=2)
            )]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error during insert: {str(e)}"
            )]

    else:
        return [TextContent(
            type="text",
            text=f"Unknown tool: {name}"
        )]


async def main():
    """Run the MCP server"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())