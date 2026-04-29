import asyncio
print("LOOP:", type(asyncio.get_event_loop()))
async def app(scope, receive, send):
    pass