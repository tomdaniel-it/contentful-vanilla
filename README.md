# Contentful Vanilla
This library allows for easy integration between a vanilla website (no framworks such as vue, react, angular, ...) and [Contentful](https://www.contentful.com/).

## Installation
Add following script and include the dayjs.min.js & contentful.js scripts before the closing `</body>` tag:
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
Contentful allows for content storage and exposes this content through their api's, this library uses their graphQL api. In graphQL, you describe what content you want to retrieve.
Here's an **example of a graphQL query** to retrieve a list of all blog posts and a specific blog post with its content:
```graphql
{
  blogPostCollection {
    items {
      title,
      description,
      publishedAt,
      banner {
        title,
        url
      },
      description
    }
  },
  blogPost(id:"zf9a8f4ds3f1d") {
    title,
    publishedAt,
    banner {
      title,
      url
    },
    content {
      json
    }
  }
}
```

This Contentful Vanilla library maps these properties to html elements with custom attributes. The idea is to just add attributes to your html elements, the library will fetch the content based on the values of these attributes and inject the data into the DOM.

### Fill data for specific content object
If you want to inject the data for a specific content object, then you can use the following attributes on your container HTML element:
- `data-contentful-content="blogPost"`: for retrieving single content object
- `data-contentful-id="xxx"`: defines the id of the object to retrieve data from

Inside your object container HTML element, you can now add following attributes on elements to inject data of your content object:
- `data-contentful-property="xxx"`: defines what property value will be injected
- `data-contentful-type="xxx"`: defines the Contentful data type to be injected

Example:
```html
<div data-contentful-content="blogPost" data-contentful-id="zf9a8f4ds3f1d">
    <h1 data-contentful-property="title" data-contentful-type="text"></h1>
    <p data-contentful-property="description" data-contentful-type="text-multiline"></p>
    <small data-contentful-property="publishedAt" data-contentful-type="date"></small>
    <img data-contentful-property="banner" data-contentful-type="image"/>
</div>
```

#### Content types
The supported types for the attribute `data-contentful-type="xxx"` are:
- `text`
- `text-multiline`
- `date`
  - For dates, the attribute `data-contentful-format="xxx"` can be added to display the date in a specific format (formatting done by dayjs). Default format: `HH:mm, D MMMM, YYYY`
- `image`
  - Expected to use with an `<img/>` element, the `src` and `alt` attributes will be injected with the title and url data provided by Contentful
- `rich-text`
  - See how to use rich texts below

#### Other attributes
- `data-contentful-attribute-fill="xxx"`: Add this attribute if you want the content to be injected into an attribute value, with xxx being the attribute name. The `{{CONTENTFUL-VALUE}}` part of the attribute will be replaced by the content value.
  - Example: `<span data-contentful-property="banner" data-contentful-type="image" data-contentful-attribute-fill="style" style="background-image: url('{{CONTENTFUL-VALUE}}');"></span>`

### Generate HTML from template for each content item in content collection
If you want to generate a html element for each content item in a collection, then you can use the following attribute on your container HTML element:
- `data-contentful-list="xxx"`: all content elements for the collection xxx will be injected into this container. NOTE: The value of this attribute should not contain the `Collection` suffix.

Inside your container HTML element, you need to place one HTML element. This will be viewed as your template, and for each content item in your collection, this template will be generated.
Inside the template, you can use the basic attributes mentioned above to inject content data.

Example:
```html
<div data-contentful-list="blogPost">
    <div class="myTemplate">
        <h1 data-contentful-property="title" data-contentful-type="text"></h1>
    </div>
</div>
```

### Rich text
Rich texts in Contentful can contain all kinds of text styles, links and images. For each type of text/image/link, a template needs to be defined so that the library knows which html to inject for which rich text type.
Inside your rich text container, which contains the `data-contentful-type="rich-text"` attribute, you need to add an element with the attribute `data-contentful-rich-link="xxx"` for each rich text type.

The supported rich text types (= values for the `data-contentful-rich-link` attribute) are:
- `heading-1`
- `heading-2`
- `heading-3`
- `heading-4`
- `heading-5`
- `heading-6`
- `paragraph`
- `unordered-list`
  - `child-item` (A list contains multiple items, for each item a template has to be defined as well)
- `ordered-list`
  - `child-item` (A list contains multiple items, for each item a template has to be defined as well)
- `list-item-paragraph` (By default in Contentful, list items are paragraphs. Paragraphs in websites often need different styling (ex: margin) than list items. With this type, you can style list items seperately from paragraphs.)
- `hr`
- `embedded-asset-block` (Image)
- `hyperlink` (Link to url)
- `asset-hyperlink` (Link to Contentful asset)
- `entry-hyperlink` (Link to other content item of same type, ex: link to previous/next blog item)

An example of a template for a **heading-1** would look something like:
```html
<div data-contentful-property="content" data-contentful-type="rich-text">
    <h1 class="myCustomH1Class" data-contentful-rich-link="heading-1"></h1>
</div>
```

If you want the value to be injected deeper into your template element instead of at the top level, then you can use the `data-contentful-rich-value` attribute. The element containing this attribute will have content injected into it.
Example:
```html
<div data-contentful-property="content" data-contentful-type="rich-text">
    <h1 class="myCustomH1Class" data-contentful-rich-link="heading-1">Title: <span data-contentful-rich-value></span></h1>
</div>
```

The **entry-hyperlink** type is special in the way that it will also add a href attribute to the element, so that you can link to another content item in your website.
A second attribute on this template element is required: `data-contentful-rich-embed-hyperlink-url`, containing the url and where the string `{{ID}}` will be replaced by the id of the Contentful object.
Example:
```html
<div data-contentful-property="content" data-contentful-type="rich-text">
    <a data-contentful-rich-link="entry-hyperlink" data-contentful-rich-embed-hyperlink-url="./post.html?id={{ID}}"></a>
</div>
```

**! Content of types which have no templates defined will not be injected into the rich-text container !**

An example of an entire rich-text container:
```html
<div id="post" data-contentful-content="blogPost" data-contentful-id="zf9a8f4ds3f1d">
    <div data-contentful-property="content" data-contentful-type="rich-text">
        <h1 data-contentful-rich-link="heading-1">Title: <span data-contentful-rich-value></span></h1>
        <h2 data-contentful-rich-link="heading-2"></h2>
        <h3 data-contentful-rich-link="heading-3"></h3>
        <h4 data-contentful-rich-link="heading-4"></h4>
        <h5 data-contentful-rich-link="heading-5"></h5>
        <h6 data-contentful-rich-link="heading-6"></h6>
        <p data-contentful-rich-link="paragraph"></p>
        <ul data-contentful-rich-link="unordered-list">
            <li data-contentful-rich-link="child-item"></li>
        </ul>
        <ol data-contentful-rich-link="ordered-list">
            <li data-contentful-rich-link="child-item">List item: <span data-contentful-rich-value></span></li>
        </ol>
        <span data-contentful-rich-link="list-item-paragraph"></span>
        <blockquote data-contentful-rich-link="blockquote"></blockquote>
        <hr data-contentful-rich-link="hr">
        <div data-contentful-rich-link="embedded-asset-block"><img data-contentful-rich-value></div>
        <a data-contentful-rich-link="hyperlink"></a>
        <a data-contentful-rich-link="asset-hyperlink"></a>
        <a data-contentful-rich-link="entry-hyperlink" data-contentful-rich-embed-hyperlink-url="./post.html?id={{ID}}"></a>
    </div>
</div>
```

### Custom events
The Contentful Vanilla library fires the custom event `contentfulLoaded` when all the Contentful content has been added to the DOM. You can listen to this event with javascript:
```javascript
document.addEventListener('contentfulLoaded', () => {
    // Action when all contentful content has loaded
});
```
