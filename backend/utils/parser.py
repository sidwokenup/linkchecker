def parse_links(input_links: str):
    links = [link.strip() for link in input_links.split(",")]
    
    valid_links = []
    for l in links:
        if l:
            if not l.startswith("http://") and not l.startswith("https://"):
                l = "https://" + l
            valid_links.append(l)
            
    return list(set(valid_links))