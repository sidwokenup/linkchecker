import asyncio

async def run_with_concurrency(limit, tasks):
    semaphore = asyncio.Semaphore(limit)
    
    async def sem_task(task):
        async with semaphore:
            return await task
            
    return await asyncio.gather(*(sem_task(task) for task in tasks))