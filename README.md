# ContentFul Vanilla
This library allows for easy integration between a vanilla website (no framworks such as vue, react, angular, ...) and [ContentFul](https://www.contentful.com/).

## Installation
Add following script and include the contentful.js script before the closing `</body>` tag:
```html
<script>
    const contentfulSpaceId = 'YOUR-SPACE-ID';
    const contentfulCdaToken = 'YOUR-CDA-TOKEN';

    document.addEventListener('contentfulLoaded', () => {
        // Action when all contentful content has loaded
    });
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.10.7/dayjs.min.js"></script>
<script src="js/contentful.js"></script>
```

## Usage
See demo index.html & post.html as examples.
