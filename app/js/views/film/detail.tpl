<div class="content scrollbar">
    <div>
        <h1><%= film.title %></h1>
    </div>
    <div>
        <img src="<%= film.medium_cover_image %>">
    </div>
    <div>
        <h2>Жанры</h2>
        <% _.each(film.genres, function(genre){ %>
        <%= genre %>
        <% }); %>
    </div>
    <div>
        <h2>Год <%= film.year %>
            <div id="player"></div>
        </h2>
    </div>
    <div>
        <h2>Рейтинг <%= film.rating %></h2>
    </div>
    <div>
        <h2>Торренты</h2>


        <% _.each(film.torrents, function(torrent){ %>
        <button>Смотреть <%= torrent.quality %></button>
        <a href="<%= torrent.url %>" class="torrent_link">Ссылка</a>
        <% }); %>
    </div>



</div>