<div class="content scrollbar" id="style-1">
    <h2>Новинки</h2>

    <style>
        .item{
            width: <%= settings().poster.width %>px;
        }
        .item .poster {
            width: <%= settings().poster.width %>px;
            height: <%= settings().poster.height %>px;
            background-size: <%= settings().poster.width %>px <%= settings().poster.height %>px;
        }
    </style>

    <div class="films">
        <% _.each(films, function(film){ %>
        <div class="item m-l-r left">
            <div class="poster" style="background-image: url('<%= film.medium_cover_image %>');">
            </div>
            <div class="title">
                <%= film.title %>
            </div>
            <div class="year">
                <%= film.year %>
            </div>
            <div class="raiting">
                <%= film.rating %>
            </div>
        </div>
        <% }); %>
        <div class="clear"></div>
    </div>
</div>