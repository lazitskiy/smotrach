<div class="content scrollbar">
    <div id="movie-content">
        <div class="w25">
            <div class="movie-poster">
                <img class="img-responsive " src="<%= film.poster %>">
            </div>
        </div>

        <div id="movie-info" class="movie-info w75">
            <h1><%= film.title %></h1>


            <div class="p">
                <h2>
                    Дата выхода: <a class="theme" href="/serials/year/2015">
                        10.04.2015 </a>
                </h2>

                <h2>
                    Жанры: <a class="theme" href="/serials/foreign-tv">Зарубежный сериал</a>
                    <a class="theme" href="/serials/action">Боевик</a>
                    <a class="theme" href="/serials/scifiction">Фантастика</a>
                </h2>
                Продолжительность: : ~ 01:00:00
            </div>


            <div class="p">
                Страны: <a class="theme" href="/serials/country/us">США</a>
            </div>

            <div class="p">
                Закладки: <a class="theme" href="/serials/bookmark/be-continued">to be continued...</a>
                <a class="theme" href="/serials/bookmark/hdtv-1080i">HDTV/HDTVRip 1080i</a>
                <a class="theme" href="/serials/bookmark/hdtv-720p">HDTV/HDTVRip 720p</a>
                <a class="theme" href="/serials/bookmark/komiks">Комикс</a>
            </div>

            <div class="p">
                Режиссеры: <a class="theme" href="/serials/actor/fil-abraham">Дрю Годдард</a>
            </div>

            <div class="p">
                Продюсеры: <a class="theme" href="/serials/actor/kati-dzhonston">Кати Джонстон</a>
                <a class="theme" href="/serials/actor/stiven-s-denajt">Стивен С. ДеНайт</a>
                <a class="theme" href="/serials/actor/dryu-goddard">Дрю Годдард</a>
            </div>

            <div class="p">
                Актеры: <a class="theme" href="/serials/actor/vinsent-donofrio">Винсент Д'Онофрио</a>
                <a class="theme" href="/serials/actor/charli-koks">Чарли Кокс</a>
                <a class="theme" href="/serials/actor/dzheffri-kantor">Джеффри Кантор</a>
                <a class="theme" href="/serials/actor/dzhudit-delgado">Джудит Дельгадо</a>
                <a class="theme" href="/serials/actor/skajlar-gertner">Скайлар Гертнер</a>
                <a class="theme" href="/serials/actor/rozario-douson">Розарио Доусон</a>
                <a class="theme" href="/serials/actor/skott-glenn">Скотт Гленн</a>
                <a class="theme" href="/serials/actor/tobi-mur">Тоби Мур</a>
                <a class="theme" href="/serials/actor/elden-henson">Элден Хенсон</a>
                <a class="theme" href="/serials/actor/majkl-karlsen">Майкл Карлсен</a>
            </div>


        </div>

        <div class="clear"></div>
        <div class="movie-images pb">
            <h3>Кадры из фильма</h3>
            <img height="140" src="http://smotrach.loc/static/images/s3/ni/lh/sorvigolova-1-scene.jpg">
            <img height="140" src="http://smotrach.loc/static/images/s2/al/vj/sorvigolova-1-scene.jpg">
            <img height="140" src="http://smotrach.loc/static/images/s1/vw/nj/sorvigolova-1-scene.jpg">
            <div class="clear"></div>
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
            <h2>Рейтинг <%= film.rating_int %></h2>
        </div>
        <div>
            <h2>Торренты</h2>

            <% _.each(film.torrents, function(torrent){ %>
            <button>Смотреть <%= torrent.quality %></button>
            <a href="<%= torrent.url %>" class="torrent_link">Ссылка</a>
            <% }); %>
        </div>
    </div>
</div>